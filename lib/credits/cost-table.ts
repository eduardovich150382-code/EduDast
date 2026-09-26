import type { DocumentType } from "@/lib/generated/prisma/client";

/**
 * Hujjat turi + parametrlar → KREDIT narxi.
 *
 * SOF FUNKSIYA: bazaga bormaydi, vaqtga bog'liq emas, `Math.random` yo'q.
 * Shuning uchun eng zich test qamrovi shu yerda (`lib/budget/guard.ts` dagi
 * `decideBudget` naqshi — chegaralarni bazasiz sinash uchun).
 *
 * IKKI KAFOLAT STRUKTURAGA YOZILGAN:
 *   1. NOL NARX YO'Q — har tarmoq `Math.max(MIN_PRICE, ...)` bilan tugaydi.
 *      Nol narxli yo'l "bepul generatsiya" degani, ya'ni cheksiz suiiste'mol
 *      va to'g'ridan-to'g'ri pul yo'qotish.
 *   2. MONOTONLIK — birlik soni narxga FAQAT `Math.ceil(clamp(n) / step)`
 *      orqali kiradi, bu esa kamaymaydigan funksiya. Boshqa arifmetika
 *      kiritilsa `tests/credits-cost-table.test.ts` uni ushlaydi.
 *
 * NARXLAR VAQTINCHA — 08-SESSIYADAN KEYIN QAYTA KO'RILADI.
 * Hozir hujjatning HAQIQIY LLM xarajati o'lchanmagan: `docs/reja.md` dagi
 * ~$0.40 — taxmin, `gemini-embedding-001` narxi esa umuman tasdiqlanmagan
 * (`lib/llm/models.ts`). Shuning uchun jadval ataylab yuqori chegarada
 * turadi. 08-sessiya tugagach `LlmCall.costUsd` ni hujjat turi bo'yicha
 * jamlab (`SUM` + `GROUP BY purpose`), o'lchangan marja imkon bersa narx
 * tushiriladi — NARXNI TUSHIRISH OSON, KO'TARISH QIYIN.
 */

/** Hech bir hujjat bundan arzon bo'lmaydi. */
export const MIN_PRICE = 1;

export type CostInput =
  | { type: "LESSON_PLAN" }
  | { type: "GUIDE" }
  | { type: "TEST"; questionCount: number }
  | { type: "SLIDES"; slideCount: number }
  | { type: "CROSSWORD"; wordCount: number };

/**
 * Birlik chegaralari. Generatsiya formasi (08/10/14-sessiyalar) AYNAN shu
 * qiymatlardan o'qishi kerak — forma bilan narx jadvali ajralib ketsa,
 * foydalanuvchi ko'rgan narx bilan yechilgan kredit farq qiladi.
 */
export const UNIT_LIMITS = {
  TEST: { min: 5, max: 40, step: 4 },
  SLIDES: { min: 6, max: 20, step: 4 },
  CROSSWORD: { min: 6, max: 20, step: 5 },
} as const;

/**
 * Bazis narx — turning o'zi qancha LLM bosqichi talab qilishiga qarab.
 * `Record<DocumentType, number>`: sxemaga yangi tur qo'shilsa TypeScript shu
 * yerda yiqiladi, ya'ni narxsiz (bepul) tur paydo bo'lmaydi.
 */
const BASE: Record<DocumentType, number> = {
  LESSON_PLAN: 5, // 3 bosqichli konveyer + kurikulum konteksti (08-sessiya)
  TEST: 2, // blueprint + 2 yarim (10-sessiya), qolgani savol soniga
  SLIDES: 3, // struktura + 2 yarim (14-sessiya)
  CROSSWORD: 2, // panjara mahalliy hisoblanadi, LLM faqat so'z/ta'rif beradi
  GUIDE: 4,
};

/**
 * Birlik sonini chegaraga tortadi.
 *
 * `NaN` / `Infinity` / kasr son — `min` ga tushadi va TASHLANMAYDI: bu
 * funksiya forma narx ko'rsatkichida ham chaqiriladi (foydalanuvchi maydonga
 * yozayotganda), u yerda exception oq ekran beradi. Haqiqiy validatsiya —
 * Zod, forma va server action darajasida.
 */
function clampUnits(value: number, limit: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return limit.min;
  return Math.min(Math.max(Math.trunc(value), limit.min), limit.max);
}

/** Monotonlikning yagona manbai: `ceil` kamaymaydigan funksiya. */
function unitCost(value: number, limit: { min: number; max: number; step: number }): number {
  return Math.ceil(clampUnits(value, limit) / limit.step);
}

export function creditCost(input: CostInput): number {
  const base = BASE[input.type];

  // `default` ATAYLAB YO'Q va har tarmoq `return` qiladi — yangi
  // `DocumentType` qo'shilganda TypeScript aynan shu `switch` da yiqiladi.
  switch (input.type) {
    case "LESSON_PLAN":
    case "GUIDE":
      return Math.max(MIN_PRICE, base);
    case "TEST":
      return Math.max(MIN_PRICE, base + unitCost(input.questionCount, UNIT_LIMITS.TEST));
    case "SLIDES":
      return Math.max(MIN_PRICE, base + unitCost(input.slideCount, UNIT_LIMITS.SLIDES));
    case "CROSSWORD":
      return Math.max(MIN_PRICE, base + unitCost(input.wordCount, UNIT_LIMITS.CROSSWORD));
  }
}
