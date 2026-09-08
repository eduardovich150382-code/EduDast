"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Admin paneli action'lari (docs/sessions/03 — kurikulum).
 *
 * Har biri: `"use server"` -> `requireAdmin()` -> Zod -> yozish ->
 * `revalidatePath`. Auth validatsiyadan OLDIN (CLAUDE.md 6-qoida).
 *
 * DIQQAT: `app/[locale]/admin/layout.tsx` dagi qorovul bu action'larni
 * HIMOYA QILMAYDI — server action POST'i layout'dan o'tmaydi. Shuning
 * uchun har biri o'zi `requireAdmin()` chaqiradi, istisnosiz.
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno), shuning
 * uchun xato kodlari ham shu yerda qisqa satr.
 */

export type AdminResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "topilmadi" | "bolasi-bor" };

const ADMIN_PATHS = ["/[locale]/admin", "/[locale]/admin/fanlar", "/[locale]/admin/mavzular"];

/**
 * Onboarding va /ish sahifalari kesh ishlatmaydi (cookie o'qigani uchun
 * dinamik), shuning uchun ular uchun alohida invalidatsiya kerak emas —
 * bu yerda faqat admin jadvallarining o'zi yangilanadi.
 */
function revalidateAdmin(): void {
  for (const path of ADMIN_PATHS) revalidatePath(path, "page");
}

const toggleSchema = z.object({
  slug: z.string().min(1).max(64),
  isActive: z.boolean(),
});

const idSchema = z.object({ id: z.string().min(1).max(64) });

const updateTopicSchema = z.object({
  id: z.string().min(1).max(64),
  titleUz: z.string().trim().min(1).max(200),
  titleUzCyrl: z.string().trim().min(1).max(200),
  titleRu: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).max(9999),
  hoursPlan: z.number().int().min(1).max(999).nullable(),
  objectives: z.array(z.string().trim().min(1).max(500)).max(50),
  keywords: z.array(z.string().trim().min(1).max(100)).max(50),
});

/** Fanni onboarding'da "tayyor" yoki "tez orada" qilib belgilaydi. */
export async function toggleSubjectActive(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const updated = await prisma.subject.updateMany({
    where: { slug: parsed.data.slug },
    data: { isActive: parsed.data.isActive },
  });
  if (updated.count === 0) return { ok: false, error: "topilmadi" };

  revalidateAdmin();
  return { ok: true };
}

export async function updateTopic(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = updateTopicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { id, ...data } = parsed.data;

  // O'chirilgan mavzu tahrirlanmaydi — `updateMany` + `deletedAt: null`
  // shartini bitta so'rovda bajaradi (avval o'qib, keyin yozish o'rniga).
  const updated = await prisma.topic.updateMany({
    where: { id, deletedAt: null },
    data,
  });
  if (updated.count === 0) return { ok: false, error: "topilmadi" };

  revalidateAdmin();
  return { ok: true };
}

/**
 * Soft delete (CLAUDE.md: hech qachon `delete`).
 *
 * Bolasi bor tugun O'CHIRILMAYDI: aks holda bolalar daraxtdan yo'qolib,
 * lekin bazada yetim `parentId` bilan qolib ketardi.
 */
export async function deleteTopic(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const children = await prisma.topic.count({
    where: { parentId: parsed.data.id, deletedAt: null },
  });
  if (children > 0) return { ok: false, error: "bolasi-bor" };

  const deleted = await prisma.topic.updateMany({
    where: { id: parsed.data.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (deleted.count === 0) return { ok: false, error: "topilmadi" };

  revalidateAdmin();
  return { ok: true };
}
