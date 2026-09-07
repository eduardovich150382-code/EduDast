"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { setSessionCookie } from "@/lib/auth/cookies";
import { isOnboarded } from "@/lib/auth/onboarding";
import { prisma } from "@/lib/db";
import { GRADES, MAX_GRADE, MIN_GRADE } from "@/lib/grades";
import { redirect } from "@/lib/i18n/navigation";
import { UZ_REGION_CODES } from "@/lib/uz-regions";

/**
 * Onboarding'ning 3 qadami (docs/sessions/02-auth.md, 4-band). Har biri:
 * `"use server"` -> `requireAuth()` -> Zod -> yozish (CLAUDE.md 6-qoida —
 * auth validatsiyadan OLDIN, kirmagan chaqiruvchi sxema haqida hech narsa
 * bilmasligi uchun). Har qadam DARHOL saqlaydi — yarim yo'lda chiqib
 * ketish progress yo'qotmaydi.
 *
 * Har yozuvdan keyin sessiya cookie'si `onb` bilan qayta chiqariladi —
 * shu orqali onboarding tugagach proxy.ts DARHOL to'g'ri qaror qiladi
 * (server komponent cookie o'zgartira olmaydi, server action esa oladi).
 */

export type ActionResult = { ok: true } | { ok: false; error: "invalid" };

const subjectsSchema = z.object({
  subjects: z.array(z.string().min(1).max(64)).min(1).max(30),
});

const gradesSchema = z.object({
  grades: z.array(z.number().int().min(MIN_GRADE).max(MAX_GRADE)).min(1).max(GRADES.length),
});

const regionSchema = z.object({
  region: z.enum(UZ_REGION_CODES),
});

export async function saveSubjects(input: unknown): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = subjectsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const requested = [...new Set(parsed.data.subjects)];
  const existing = await prisma.subject.findMany({
    where: { slug: { in: requested } },
    select: { slug: true },
  });
  // Qo'lda yasalgan payload bazada yo'q slug bilan String[] ga axlat
  // yoza olmasligi kerak.
  if (existing.length !== requested.length) return { ok: false, error: "invalid" };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { subjects: requested },
    select: { subjects: true, grades: true, region: true },
  });

  await setSessionCookie({
    sub: user.id,
    onb: isOnboarded(updated),
    sv: user.sessionVersion,
  });

  return { ok: true };
}

export async function saveGrades(input: unknown): Promise<ActionResult> {
  const user = await requireAuth();
  const parsed = gradesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const grades = [...new Set(parsed.data.grades)].sort((a, b) => a - b);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { grades },
    select: { subjects: true, grades: true, region: true },
  });

  await setSessionCookie({
    sub: user.id,
    onb: isOnboarded(updated),
    sv: user.sessionVersion,
  });

  return { ok: true };
}

export async function saveRegion(input: unknown): Promise<ActionResult | never> {
  const user = await requireAuth();
  const parsed = regionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { region: parsed.data.region },
    select: { subjects: true, grades: true, region: true },
  });

  await setSessionCookie({
    sub: user.id,
    onb: isOnboarded(updated),
    sv: user.sessionVersion,
  });

  return redirect({ href: "/ish", locale: await getLocale() });
}
