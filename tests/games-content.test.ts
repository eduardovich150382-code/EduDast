import { describe, expect, it } from "vitest";
import { GAME_LIMITS } from "@/lib/credits/cost-table";
import {
  GRID_WORD_MAX,
  MIN_WORD_LENGTH,
  normalizeWord,
  TILE_WORD_MAX,
} from "@/lib/games/alphabet";
import { AnagramContent, GameContent, WheelContent, WordSearchContent } from "@/lib/games/content";
import { gameTail } from "@/lib/generation/prompts";
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
    const worst = max * GRID_WORD_MAX;
    // Oyna = eng yomon holat shiftdan qancha oshadi.
    const window = Math.max(0, worst - MAX_TOTAL_LETTERS);
    expect(window, `${String(max)} so'z uchun yiqilish oynasi juda keng`).toBeLessThanOrEqual(10);
  });

  it("promptdagi tavsiya oraliq sxema ichida", () => {
    // Model tavsiyani bajarsa javob HAR DOIM parse bo'lishi kerak.
    expect(PREFERRED_WORD_MIN).toBeGreaterThanOrEqual(MIN_WORD_LENGTH);
    expect(PREFERRED_WORD_MAX).toBeLessThanOrEqual(GRID_WORD_MAX);
  });

  it("tavsiyani bajargan javob byudjetga SIG'ADI", () => {
    // Eng yuqori son x tavsiyaning yuqori chegarasi shiftdan oshmasin —
    // aks holda prompt bajarilsa ham generatsiya yiqilardi.
    const max = GAME_LIMITS["word-search"].max;
    expect(max * PREFERRED_WORD_MAX).toBeLessThanOrEqual(MAX_TOTAL_LETTERS);
  });
});
/* ------------------------------------------------------------------ */
/* Uzunlik shifti O'YIN TURIGA QARAB                                   */
/* ------------------------------------------------------------------ */

describe("uzunlik shifti kind ga bog'liq", () => {
  /**
   * BU TEST REGRESSIYANI QO'RIQLAYDI.
   *
   * Ilgari bitta `MAX_WORD_LENGTH = 10` ikkala o'yinga ham qo'llanardi.
   * So'z qidirishda bu to'g'ri (12x12 panjara), anagrammada esa XATO:
   * u yerda panjara yo'q, harflar plitkada turadi. Natijada
   * `kondensatsiya` (13), `trayektoriya` (12) kabi atamalar anagrammaga
   * ham tusha olmasdi — holbuki aynan ular uchun anagramma eng mos
   * o'yin, chunki so'z qidirishda ular baribir tashlanadi.
   */
  it("anagramma shifti so'z qidirishdan KATTA", () => {
    expect(TILE_WORD_MAX).toBeGreaterThan(GRID_WORD_MAX);
  });

  const LONG_TERMS = ["KONDENSATSIYA", "TRAYEKTORIYA", "ISHQALANISH", "SOLISHTIRMA"];

  it.each(LONG_TERMS)("%s anagrammaga TUSHADI", (word) => {
    const content = AnagramContent.safeParse({
      kind: "anagram",
      items: [word, ...["CHIZIQ", "DOIRA", "TOMON", "YUZA", "HAJM"]].map((w) => ({
        word: w,
        clue: `${w} nimani bildiradi?`,
      })),
    });
    expect(content.error?.issues ?? [], word).toEqual([]);
  });

  it.each(LONG_TERMS)("%s so'z qidirishga TUSHMAYDI", (word) => {
    // Panjara sababi: 11-12 harfli so'z faqat to'liq qator, ustun yoki
    // diagonalga sig'adi — ko'z bilan darhol ko'rinadi.
    const content = WordSearchContent.safeParse({
      kind: "word-search",
      words: [word, "CHIZIQ", "DOIRA", "TOMON", "YUZA", "HAJM", "KESMA", "QIRRA"],
    });
    expect(content.success, word).toBe(false);
  });

  it("normalizeWord shiftni PARAMETRDAN oladi", () => {
    // Majburiy parametr: default qo'yilsa yangi chaqiruvchi uni
    // e'tiborsiz qoldirib panjara shiftini anagrammaga qo'llardi.
    expect(normalizeWord("kondensatsiya", TILE_WORD_MAX)).toBe("KONDENSATSIYA");
    expect(normalizeWord("kondensatsiya", GRID_WORD_MAX)).toBeNull();
  });

  it("anagramma shifti plitka qatoriga sig'adigan darajada", () => {
    // Cheksiz emas: bundan uzun atama bola uchun topishga emas,
    // sanashga aylanadi.
    expect(TILE_WORD_MAX).toBeLessThanOrEqual(16);
  });

  it("ikkala shift ham MIN dan katta", () => {
    expect(GRID_WORD_MAX).toBeGreaterThan(MIN_WORD_LENGTH);
    expect(TILE_WORD_MAX).toBeGreaterThan(MIN_WORD_LENGTH);
  });
});

describe("gameTail uzunlik ko'rsatmasi kind ga bog'liq", () => {
  it("so'z qidirishda PANJARA shifti aytiladi", () => {
    const tail = gameTail({ gameKind: "word-search", itemCount: 10 });
    expect(tail).toContain(`${String(MIN_WORD_LENGTH)}-${String(GRID_WORD_MAX)} harf`);
    expect(tail).toContain("panjaraga sig'maydi");
  });

  it("anagrammada PLITKA shifti aytiladi va panjara eslatilmaydi", () => {
    const tail = gameTail({ gameKind: "anagram", itemCount: 8 });
    expect(tail).toContain(`${String(MIN_WORD_LENGTH)}-${String(TILE_WORD_MAX)} harf`);
    expect(tail).toContain("panjara yo'q");
    expect(tail).not.toContain("panjaraga sig'maydi");
  });

  it("ikkala turda ham BITTA SO'Z sharti bor", () => {
    // Qo'shma ibora ikkalasida ham yaramaydi, lekin sababi boshqa:
    // panjarada bo'sh joy katagi yo'q, plitkada esa bola so'zni
    // tiklay olmaydi.
    for (const gameKind of ["word-search", "anagram"] as const) {
      expect(gameTail({ gameKind, itemCount: 8 }), gameKind).toContain("BITTA so'z");
    }
  });

  it("g'ildirakda uzunlik ko'rsatmasi UMUMAN yo'q", () => {
    // Sektor savollari panjaraga ham, plitkaga ham tushmaydi.
    const tail = gameTail({ gameKind: "wheel", itemCount: 8 });
    expect(tail).not.toContain("harf");
  });
});
