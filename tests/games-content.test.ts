import { describe, expect, it } from "vitest";
import { GAME_LIMITS } from "@/lib/credits/cost-table";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "@/lib/games/alphabet";
import { AnagramContent, GameContent, WheelContent, WordSearchContent } from "@/lib/games/content";
import {
  MAX_TOTAL_LETTERS,
  PREFERRED_WORD_MAX,
  PREFERRED_WORD_MIN,
} from "@/lib/games/grid";
import { GAME_KINDS } from "@/lib/games/types";

const sector = (n: number) => ({
  category: `Kategoriya ${String(n)}`,
  question: `Savol ${String(n)}?`,
  answer: `Javob ${String(n)}`,
});

const WHEEL = { kind: "wheel" as const, sectors: Array.from({ length: 8 }, (_, i) => sector(i)) };

const WORDS = [
  "CHIZIQ",
  "UCHBURCHAK",
  "KVADRAT",
  "DOIRA",
  "BURCHAK",
  "TOMON",
  "YUZA",
  "HAJM",
];

const WORD_SEARCH = { kind: "word-search" as const, words: WORDS };

const ANAGRAM = {
  kind: "anagram" as const,
  items: WORDS.slice(0, 6).map((word) => ({ word, clue: `${word} ning ta'rifi` })),
};

describe("WheelContent", () => {
  it("sakkiz sektorli mazmun o'tadi", () => {
    expect(WheelContent.safeParse(WHEEL).success).toBe(true);
  });

  it.each([7, 9])("%s sektor rad etiladi", (count) => {
    const content = { ...WHEEL, sectors: Array.from({ length: count }, (_, i) => sector(i)) };
    expect(WheelContent.safeParse(content).success).toBe(false);
  });

  it("takrorlangan kategoriya rad etiladi", () => {
    const sectors = Array.from({ length: 8 }, (_, i) => sector(i));
    sectors[3] = { ...sectors[3]!, category: sectors[0]!.category };
    expect(WheelContent.safeParse({ ...WHEEL, sectors }).success).toBe(false);
  });

  it("noma'lum kalit rad etiladi", () => {
    expect(WheelContent.safeParse({ ...WHEEL, extra: 1 }).success).toBe(false);
  });
});

describe("WordSearchContent", () => {
  it("normallashgan so'zlar o'tadi", () => {
    expect(WordSearchContent.safeParse(WORD_SEARCH).success).toBe(true);
  });

  it("normallashmagan so'z rad etiladi", () => {
    // Sxema TUZATMAYDI, faqat tekshiradi: bazada tozalanmagan so'z bo'lsa
    // u ko'rinishi kerak, jimgina tuzatilib ketmasligi kerak.
    for (const bad of ["o'quvchi", "chiziq", "Chiziq", "AB", "AAA", "WORD"]) {
      const content = { ...WORD_SEARCH, words: [bad, ...WORDS.slice(1)] };
      expect(WordSearchContent.safeParse(content).success, bad).toBe(false);
    }
  });

  it("takrorlangan so'z rad etiladi", () => {
    const content = { ...WORD_SEARCH, words: [WORDS[0]!, ...WORDS.slice(0, 7)] };
    expect(WordSearchContent.safeParse(content).success).toBe(false);
  });

  it.each([7, 15])("%s ta so'z chegaradan chiqadi", (count) => {
    const words = Array.from({ length: count }, (_, i) => `SOZ${String(i).padStart(2, "A")}`);
    expect(WordSearchContent.safeParse({ ...WORD_SEARCH, words }).success).toBe(false);
  });
});

describe("AnagramContent", () => {
  it("olti element o'tadi", () => {
    expect(AnagramContent.safeParse(ANAGRAM).success).toBe(true);
  });

  it("besh element rad etiladi", () => {
    expect(AnagramContent.safeParse({ ...ANAGRAM, items: ANAGRAM.items.slice(0, 5) }).success).toBe(
      false,
    );
  });

  it("takrorlangan so'z rad etiladi", () => {
    const items = [...ANAGRAM.items];
    items[2] = { ...items[2]!, word: items[0]!.word };
    expect(AnagramContent.safeParse({ ...ANAGRAM, items }).success).toBe(false);
  });

  it("ta'rifsiz element rad etiladi", () => {
    const items = ANAGRAM.items.map((item) => ({ word: item.word }));
    expect(AnagramContent.safeParse({ ...ANAGRAM, items }).success).toBe(false);
  });
});

describe("GameContent union", () => {
  it("uchala kind parse bo'ladi", () => {
    for (const content of [WHEEL, WORD_SEARCH, ANAGRAM]) {
      const parsed = GameContent.safeParse(content);
      expect(parsed.success, JSON.stringify(content.kind)).toBe(true);
    }
  });

  it("noma'lum kind rad etiladi", () => {
    expect(GameContent.safeParse({ kind: "crossword", words: WORDS }).success).toBe(false);
  });

  it("GAME_KINDS union tarmoqlariga mos", () => {
    // Union'ga tarmoq qo'shib `GAME_KINDS` ni yangilashni esdan chiqarish
    // reyestrni yarim holatda qoldirardi.
    const parsedKinds = [WHEEL, WORD_SEARCH, ANAGRAM].map((c) => c.kind);
    expect([...parsedKinds].sort()).toEqual([...GAME_KINDS].sort());
  });
});
/* ------------------------------------------------------------------ */
/* Sig'im va so'raladigan son muvofiqligi                              */
/* ------------------------------------------------------------------ */

describe("panjara sig'imi va GAME_LIMITS", () => {
  /**
   * BU TEST QARORNING SABABINI QULFLAYDI.
   *
   * `fitLetters` jami harf shiftidan oshgan so'zlarni tashlaydi,
   * `checkGameContent` esa son yetmasa bosqichni yiqitadi — QAYTA
   * URINISH YO'Q, ya'ni o'qituvchi "Yakunlanmadi" ni ko'radi (krediti
   * qaytsa ham).
   *
   * Shuning uchun so'raladigan eng yuqori son shunday tanlangan: model
   * eng uzun ruxsat etilgan so'zlarni qaytarganda ham byudjet yiqilishi
   * TOR oyna bo'lib qolsin.
   *
   *   10 so'z x 10 harf = 100 <= 112 -> yiqilish MUMKIN EMAS
   *   12 so'z x 10 harf = 120 >  112 -> faqat 113-120 oralig'ida
   *   14 so'z x 10 harf = 140 >  112 -> keng oyna (shuning uchun 14 EMAS)
   */
  it("eng yuqori son bilan ham yiqilish oynasi tor", () => {
    const max = GAME_LIMITS["word-search"].max;
    const worst = max * MAX_WORD_LENGTH;
    // Oyna = eng yomon holat shiftdan qancha oshadi.
    const window = Math.max(0, worst - MAX_TOTAL_LETTERS);
    expect(window, `${String(max)} so'z uchun yiqilish oynasi juda keng`).toBeLessThanOrEqual(10);
  });

  it("promptdagi tavsiya oraliq sxema ichida", () => {
    // Model tavsiyani bajarsa javob HAR DOIM parse bo'lishi kerak.
    expect(PREFERRED_WORD_MIN).toBeGreaterThanOrEqual(MIN_WORD_LENGTH);
    expect(PREFERRED_WORD_MAX).toBeLessThanOrEqual(MAX_WORD_LENGTH);
  });

  it("tavsiyani bajargan javob byudjetga SIG'ADI", () => {
    // Eng yuqori son x tavsiyaning yuqori chegarasi shiftdan oshmasin —
    // aks holda prompt bajarilsa ham generatsiya yiqilardi.
    const max = GAME_LIMITS["word-search"].max;
    expect(max * PREFERRED_WORD_MAX).toBeLessThanOrEqual(MAX_TOTAL_LETTERS);
  });
});
