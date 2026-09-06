import { defineRouting } from "next-intl/routing";

/**
 * Qo'llab-quvvatlanadigan tillar: o'zbek lotin (standart), o'zbek kirill, rus.
 * localePrefix: "always" — "/" har doim "/uz" ga (yoki foydalanuvchi
 * tanlagan tilga) yo'naltiriladi, prefikssiz yo'l bo'lmaydi.
 */
export const routing = defineRouting({
  locales: ["uz", "uz-Cyrl", "ru"],
  defaultLocale: "uz",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
