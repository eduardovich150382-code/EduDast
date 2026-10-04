"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routing } from "@/lib/i18n/routing";

/**
 * Sozlamalar action'lari (docs/sessions/12-eslatmalar.md, 7-band).
 *
 * Tartib: `"use server"` -> `requireAuth()` -> Zod -> yozish ->
 * `revalidatePath`. Auth BIRINCHI await (CLAUDE.md 6-qoida).
 *
 * NEGA `requireAuth`, `requireOnboarded` EMAS: bu sozlamalar hech qanday
 * onboarding ma'lumotiga (fan, sinf, viloyat) tayanmaydi — eslatmani
 * o'chirish va tilni almashtirish onboarding tugamagan foydalanuvchiga
 * ham ochiq bo'lishi kerak (`server/class-actions.ts` dagi teskari
 * qarorning sababi shu yerda yo'q).
 */

export type SettingsError = "invalid";
export type SettingsResult = { ok: true } | { ok: false; error: SettingsError };

const SETTINGS_PATHS = ["/[locale]/ish/sozlamalar", "/[locale]/ish"];

function revalidateSettings(): void {
  for (const path of SETTINGS_PATHS) revalidatePath(path, "page");
}

const prefsSchema = z.object({
  remindersEnabled: z.boolean(),
  weeklyDigestEnabled: z.boolean(),
});

/**
 * Eslatma sozlamalari. Ikkala o'girgich BIRGA yuboriladi — holat
 * ekranda bir butun ko'rinadi va yarim saqlangan juftlik bo'lmaydi.
 */
export async function saveReminderPrefs(input: unknown): Promise<SettingsResult> {
  const user = await requireAuth();
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      remindersEnabled: parsed.data.remindersEnabled,
      weeklyDigestEnabled: parsed.data.weeklyDigestEnabled,
    },
  });

  revalidateSettings();
  return { ok: true };
}

// Zod enum uchun `routing.locales` — YAGONA manba. Qo'lda yozilgan
// ro'yxat yangi til qo'shilganda jimgina eskirardi.
const localeSchema = z.object({
  locale: z.enum(routing.locales as unknown as [string, ...string[]]),
});

/**
 * Sayt tilini BAZAGA yozadi.
 *
 * NEGA KERAK: mavjud `LocaleSwitcher` faqat URL'ni almashtiradi,
 * `User.locale` esa ro'yxatdan o'tgan paytdagidek qolib ketardi
 * (`lib/auth/upsert-telegram-user.ts` uni faqat `create` da yozadi).
 * Bot eslatmalari esa AYNAN `User.locale` bo'yicha render qilinadi —
 * ya'ni o'qituvchi saytni o'zbekchada ishlatib, botdan boshqa tilda
 * xabar olardi.
 */
export async function saveLocale(input: unknown): Promise<SettingsResult> {
  const user = await requireAuth();
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  await prisma.user.update({
    where: { id: user.id },
    data: { locale: parsed.data.locale },
  });

  revalidateSettings();
  return { ok: true };
}
