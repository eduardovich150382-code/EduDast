import { describe, expect, it } from "vitest";
import {
  GAME_LIMITS,
  MIN_PRICE,
  UNIT_LIMITS,
  creditCost,
  type CostInput,
} from "@/lib/credits/cost-table";
import { DocumentType } from "@/lib/generated/prisma/enums";
import { GAME_KINDS } from "@/lib/games/types";

/**
 * lib/credits/cost-table.ts — sof funksiya, shuning uchun eng zich qamrov
 * shu yerda (bazasiz, mocksiz).
 *
 * Bu test himoya qiladigan IKKI kafolat:
 *   1. NOL NARX YO'Q — nol narxli yo'l bepul generatsiya, ya'ni cheksiz
 *      suiiste'mol.
 *   2. MONOTONLIK — birlik soni oshsa narx kamaymaydi. Bu buzilsa
 *      foydalanuvchi ko'proq ish uchun kamroq to'lardi.
 */

/** Har tur uchun birlik maydonining nomi — jadval testlari uchun. */
const UNIT_FIELD = {
  TEST: "questionCount",
  SLIDES: "slideCount",
  CROSSWORD: "wordCount",
} as const;

type UnitType = keyof typeof UNIT_FIELD;
const UNIT_TYPES = Object.keys(UNIT_FIELD) as UnitType[];

/** `{ type, <birlik maydoni>: n }` shaklidagi input yasaydi. */
function unitInput(type: UnitType, n: number): CostInput {
  return { type, [UNIT_FIELD[type]]: n } as CostInput;
}

/**
 * `GAME` `UNIT_FIELD` ga kirmaydi — uning chegarasi `kind` ga bog'liq,
 * ya'ni bitta `{min,max,step}` bilan ifodalanmaydi. Shuning uchun u
 * yuqoridagi jadval yordamchilaridan ALOHIDA yuritiladi.
 */
function gameInput(gameKind: (typeof GAME_KINDS)[number], itemCount: number): CostInput {
  return { type: "GAME", gameKind, itemCount };
}

describe("creditCost — har tur bo'yicha narx", () => {
  it.each([
    ["LESSON_PLAN", { type: "LESSON_PLAN" } as CostInput, 5],
    ["GUIDE", { type: "GUIDE" } as CostInput, 4],
    ["TEST (5 savol)", { type: "TEST", questionCount: 5 } as CostInput, 4],
    ["TEST (20 savol)", { type: "TEST", questionCount: 20 } as CostInput, 7],
    ["TEST (40 savol)", { type: "TEST", questionCount: 40 } as CostInput, 12],
    ["SLIDES (6 slayd)", { type: "SLIDES", slideCount: 6 } as CostInput, 5],
    ["SLIDES (20 slayd)", { type: "SLIDES", slideCount: 20 } as CostInput, 8],
    ["CROSSWORD (6 so'z)", { type: "CROSSWORD", wordCount: 6 } as CostInput, 4],
    ["CROSSWORD (20 so'z)", { type: "CROSSWORD", wordCount: 20 } as CostInput, 6],
    ["GAME g'ildirak (8 sektor)", gameInput("wheel", 8), 2],
    ["GAME so'z qidirish (8 so'z)", gameInput("word-search", 8), 4],
    ["GAME so'z qidirish (12 so'z)", gameInput("word-search", 12), 5],
    ["GAME anagramma (6 element)", gameInput("anagram", 6), 3],
    ["GAME anagramma (12 element)", gameInput("anagram", 12), 5],
  ])("%s → %i kredit", (_nom, input, expected) => {
    expect(creditCost(input)).toBe(expected);
  });

  /**
   * Sxemadagi HAR `DocumentType` ning narxi bo'lishi shart. Yangi tur
   * qo'shilib narx berilmasa, bu test uni darhol ushlaydi (TypeScript
   * `BASE` jadvalida ham yiqiladi, bu esa ikkinchi to'r).
   */
  it("har DocumentType narxlanadi va nol emas", () => {
    for (const type of Object.values(DocumentType)) {
      // `GAME` — `kind` ga bog'liq, shuning uchun eng arzon turi olinadi:
      // nol narx qayerda bo'lsa, aynan eng arzon yo'lda bo'lardi.
      const input =
        type === "GAME"
          ? gameInput("anagram", GAME_LIMITS.anagram.min)
          : ((type in UNIT_FIELD
              ? unitInput(type as UnitType, UNIT_LIMITS[type as UnitType].min)
              : { type }) as CostInput);

      const price = creditCost(input);
      expect(Number.isFinite(price), `${type}: narx son emas`).toBe(true);
      expect(price, `${type}: nol yoki manfiy narx`).toBeGreaterThanOrEqual(MIN_PRICE);
    }
  });
});

describe("monotonlik — savol/slayd/so'z soni oshsa narx kamaymaydi", () => {
  it.each(UNIT_TYPES)("%s", (type) => {
    const { min, max } = UNIT_LIMITS[type];

    // Chegaradan tashqarida ham tekshiramiz: `clampUnits` ni chetlab o'tadigan
    // arifmetika kiritilsa shu yerda ko'rinadi.
    let prev = creditCost(unitInput(type, min - 3));
    for (let n = min - 2; n <= max + 3; n += 1) {
      const price = creditCost(unitInput(type, n));
      expect(price, `${type}: ${n} da narx kamaydi (${prev} → ${price})`).toBeGreaterThanOrEqual(
        prev,
      );
      prev = price;
    }

    // Faqat "kamaymaydi" yetarli emas — narx birlik soniga HAQIQATAN
    // bog'lanishi kerak, aks holda 40 savol 5 savol bilan bir xil turardi.
    expect(creditCost(unitInput(type, max))).toBeGreaterThan(creditCost(unitInput(type, min)));
  });

  it.each(GAME_KINDS)("GAME %s", (gameKind) => {
    const { min, max } = GAME_LIMITS[gameKind];

    let prev = creditCost(gameInput(gameKind, min - 3));
    for (let n = min - 2; n <= max + 3; n += 1) {
      const price = creditCost(gameInput(gameKind, n));
      expect(price, `${gameKind}: ${n} da narx kamaydi (${prev} → ${price})`).toBeGreaterThanOrEqual(
        prev,
      );
      prev = price;
    }

    // G'ildirakda `min === max` (8 sektor qat'iy), ya'ni "narx birlik soniga
    // bog'lanadi" shartini u BAJARMAYDI va bajarmasligi kerak — element soni
    // tanlanmaydigan turda narx ham o'zgarmaydi.
    if (min === max) {
      expect(creditCost(gameInput(gameKind, max))).toBe(creditCost(gameInput(gameKind, min)));
    } else {
      expect(creditCost(gameInput(gameKind, max))).toBeGreaterThan(
        creditCost(gameInput(gameKind, min)),
      );
    }
  });

  /**
   * `GAME_LIMITS` ning o'zini qadaydi: har `kind` uchun yozuv borligi va
   * chegaralar mazmunli ekani. `Record<GameKind, ...>` TypeScript darajasida
   * yetishmagan kalitni ushlaydi, lekin `{min: 0, max: 0, step: 0}` kabi
   * ma'nosiz qiymatni ushlamaydi — `step: 0` esa `unitCost` da `Infinity`
   * berardi.
   */
  it("GAME_LIMITS har kind uchun mazmunli", () => {
    for (const gameKind of GAME_KINDS) {
      const limit = GAME_LIMITS[gameKind];
      expect(limit, `${gameKind}: chegara yo'q`).toBeDefined();
      expect(limit.step, `${gameKind}: step musbat emas`).toBeGreaterThan(0);
      expect(limit.min, `${gameKind}: min musbat emas`).toBeGreaterThan(0);
      expect(limit.max, `${gameKind}: max < min`).toBeGreaterThanOrEqual(limit.min);
    }
  });
});

describe("chegara va axlat qiymatlar", () => {
  it.each(UNIT_TYPES)("%s — chegaradan yuqorisi max bilan bir xil", (type) => {
    const { max } = UNIT_LIMITS[type];
    expect(creditCost(unitInput(type, max + 100))).toBe(creditCost(unitInput(type, max)));
  });

  it.each(UNIT_TYPES)("%s — chegaradan pastdagisi min bilan bir xil", (type) => {
    const { min } = UNIT_LIMITS[type];
    expect(creditCost(unitInput(type, min - 100))).toBe(creditCost(unitInput(type, min)));
  });

  /**
   * `NaN` / `Infinity` / kasr — TASHLAMAYDI, `min` ga tushadi: bu funksiya
   * forma narx ko'rsatkichida chaqiriladi, u yerda exception oq ekran beradi.
   */
  it.each([
    ["nol", 0],
    ["manfiy", -5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["kasr", 2.7],
  ])("TEST — %s qiymat ham nol narx bermaydi", (_nom, value) => {
    const price = creditCost(unitInput("TEST", value));
    expect(price).toBeGreaterThanOrEqual(MIN_PRICE);
    expect(Number.isInteger(price)).toBe(true);
  });
});
