/**
 * O'zbekiston hududlari — 12 viloyat + Qoraqalpog'iston + Toshkent shahri.
 *
 * Bu yerda faqat KODLAR turadi. Ko'rinadigan nomlar messages/*.json dagi
 * `Onboarding.regions.<kod>` kalitlarida (CLAUDE.md, 1-qoida: hardcode
 * matn yo'q). Kodlar `User.region` ga yoziladi va hech qachon
 * o'zgartirilmasligi kerak — ular bazadagi qiymatlar.
 */
export const UZ_REGION_CODES = [
  "qoraqalpogiston",
  "andijon",
  "buxoro",
  "fargona",
  "jizzax",
  "xorazm",
  "namangan",
  "navoiy",
  "qashqadaryo",
  "samarqand",
  "sirdaryo",
  "surxondaryo",
  "toshkent-viloyati",
  "toshkent-shahri",
] as const;

export type UzRegionCode = (typeof UZ_REGION_CODES)[number];
