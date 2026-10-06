import { describe, expect, it } from "vitest";
import { AnagramContent, GameContent, WheelContent, WordSearchContent } from "@/lib/games/content";
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
