"use server";

import { getLocale } from "next-intl/server";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { assertDevLoginAllowed, DEV_TELEGRAM_ID } from "@/lib/auth/dev-login";
import { isOnboarded } from "@/lib/auth/onboarding";
import { prisma } from "@/lib/db";
import { redirect } from "@/lib/i18n/navigation";

/**
 * CHEKINISH (ataylab, CLAUDE.md 6-qoidadan): odatdagi server action
 * `requireAuth()` bilan boshlanadi, lekin bu ikkalasi auth'ning
 * KIRISH/CHIQISH nuqtalarining o'zi:
 * - `logout` — sessiyasi yo'q/eskirgan chaqiruvchi uchun ham xavfsiz va
 *   idempotent bo'lishi kerak, shuning uchun avval auth talab qilmaydi.
 * - `devLogin` — `requireAuth()` bilan boshlansa aylanma bog'liqlik
 *   bo'lardi (u aynan sessiya yaratish uchun chaqiriladi). Uning o'ziga
 *   xos "auth tekshiruvi" — `assertDevLoginAllowed()`.
 * Ikkalasi ham input qabul qilmaydi, shuning uchun Zod sxemasi yo'q.
 */

export async function logout(): Promise<never> {
  await clearSessionCookie();
  return redirect({ href: "/kirish", locale: await getLocale() });
}

export async function devLogin(): Promise<never> {
  assertDevLoginAllowed();

  const user = await prisma.user.findFirstOrThrow({
    where: { telegramId: DEV_TELEGRAM_ID, deletedAt: null },
    select: { id: true, subjects: true, grades: true, region: true, sessionVersion: true },
  });

  const onboarded = isOnboarded(user);
  await setSessionCookie({ sub: user.id, onb: onboarded, sv: user.sessionVersion });

  return redirect({
    href: onboarded ? "/ish" : "/onboarding",
    locale: await getLocale(),
  });
}
