import { describe, expect, it } from "vitest";
import { FILLER_ALPHABET } from "@/lib/games/alphabet";
import { WordSearchContent } from "@/lib/games/content";
import { MAX_TOTAL_LETTERS } from "@/lib/games/grid";
import { gameSeed } from "@/lib/games/seed";
import {
  buildWordSearch,
  DIRECTIONS,
  findWord,
  GRID_SIZE,
  lettersAt,
  matchWord,
  segmentBetween,
} from "@/lib/games/word-search";

/**
 * So'z qidirish panjarasi.
 *
 * ENG MUHIM TEST — "har so'z panjarada haqiqatan topiladi": u `build` ning
 * O'Z HISOBOTIGA (`placed`) qaramaydi, balki panjarani sakkiz yo'nalish
 * bo'ylab mustaqil skanerlaydi (`findWord`). Aks holda algoritm o'zini
 * o'zi tasdiqlagan bo'lardi.
 */

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

/**
 * ENG OG'IR QABUL QILINADIGAN yuklama: 14 ta so'z (son chegarasi) va jami
 * aynan `MAX_TOTAL_LETTERS` harf (sig'im chegarasi).
 *
 * Sun'iy so'zlar ATAYLAB: ular kam kesishadi, ya'ni haqiqiy o'zbek
 * so'zlaridan QIYINROQ. Kafolat eng yomon holatda qadalishi kerak.
 */
const MAX_WORDS = Array.from({ length: 14 }, (_, i) =>
  Array.from({ length: 8 }, (_, j) => "ABDEFGHIJKLMNOPQRSTUVXYZ"[(i * 7 + j * 3) % 24]!).join(""),
);

const content = (words: string[] = WORDS) => WordSearchContent.parse({ kind: "word-search", words });

const SEED = gameSeed("doc-1", 0);

describe("buildWordSearch — panjara shakli", () => {
  const built = buildWordSearch(content(), SEED);

  it("panjara 12x12", () => {
    expect(built.size).toBe(GRID_SIZE);
    expect(built.grid).toHaveLength(GRID_SIZE);
    for (const row of built.grid) {
      expect(row).toHaveLength(GRID_SIZE);
    }
  });

  it("bo'sh katak yo'q", () => {
    for (const row of built.grid) {
      for (const cell of row) {
        expect(cell).toMatch(/^[A-Z]$/);
      }
    }
  });

  it("to'ldirish harflari FILLER_ALPHABET dan", () => {
    // So'z harflari `WORD_ALPHABET` dan (C ni ham o'z ichiga oladi),
    // to'ldirish esa `FILLER_ALPHABET` dan. Shuning uchun panjarada `C`
    // FAQAT so'z ichida uchraydi.
    const cWords = WORDS.filter((word) => word.includes("C"));
    const allowed = new Set([...FILLER_ALPHABET, ...WORDS.join("")]);
    for (const row of built.grid) {
      for (const cell of row) {
        expect(allowed.has(cell)).toBe(true);
      }
    }
    expect(cWords.length).toBeGreaterThan(0);
  });
});

describe("buildWordSearch — har so'z panjarada bor", () => {
  it("mustaqil qidiruv bilan tasdiqlanadi", () => {
    const built = buildWordSearch(content(), SEED);
    for (const placed of built.placed) {
      // `placed` yozuvidan FOYDALANILMAYDI — panjaraning o'zi skanerlanadi.
      expect(findWord(built.grid, placed.word), `${placed.word} panjarada yo'q`).not.toBeNull();
    }
  });

  it("ro'yxatdagi hamma so'z joylashgan", () => {
    const built = buildWordSearch(content(), SEED);
    expect(built.unplaced).toEqual([]);
    expect(built.placed.map((p) => p.word).sort()).toEqual([...WORDS].sort());
  });

  it("joylashuv yozuvi panjara bilan MOS", () => {
    const built = buildWordSearch(content(), SEED);
    for (const placed of built.placed) {
      const letters = [...placed.word]
        .map((_, i) => built.grid[placed.row + placed.direction.dy * i]?.[placed.col + placed.direction.dx * i])
        .join("");
      expect(letters).toBe(placed.word);
    }
  });
});

describe("buildWordSearch — to'liq joylashish kafolati", () => {
  it("eng og'ir yuklama sxemadan O'TADI", () => {
    // Kafolat faqat sxema qabul qiladigan mazmun uchun ma'noga ega,
    // shuning uchun yuklamaning o'zi chegarada turganini tasdiqlaymiz.
    const total = MAX_WORDS.reduce((sum, word) => sum + word.length, 0);
    expect(MAX_WORDS).toHaveLength(14);
    expect(total).toBe(MAX_TOTAL_LETTERS);
    expect(() => content(MAX_WORDS)).not.toThrow();
  });

  it("sig'imdan oshgan mazmun RAD ETILADI", () => {
    // 14 x 10 = 140 harf 144 katakka 97% zichlik bilan tushardi va
    // o'lchovda 9% urug'da so'z joylashmay qolardi. Sxema algoritm bajara
    // olmaydigan mazmunni qabul qilmasligi kerak.
    const tooMany = Array.from({ length: 14 }, (_, i) =>
      Array.from({ length: 10 }, (_, j) => "ABDEFGHIJKLMNOPQRSTUVXYZ"[(i * 7 + j * 3) % 24]!).join(
        "",
      ),
    );
    expect(() => content(tooMany)).toThrow();
  });

  /**
   * 400 urug' x eng og'ir QABUL QILINADIGAN yuklama.
   *
   * So'zni tashlab yuborish o'qituvchi TO'LAGAN son bilan olgan sonini
   * ajratib yuborardi (narx `itemCount` bo'yicha). Kafolat ikki qismdan:
   * `place` nomzodlarni to'liq sanaydi va sxema sig'imdan oshgan mazmunni
   * umuman kiritmaydi.
   */
  it("400 urug'da ham so'z tashlanmaydi", () => {
    const parsed = content(MAX_WORDS);
    const failures: { variant: number; unplaced: string[] }[] = [];

    for (let variant = 0; variant < 400; variant += 1) {
      const built = buildWordSearch(parsed, gameSeed("doc-yuklama", variant));
      if (built.unplaced.length > 0) failures.push({ variant, unplaced: built.unplaced });
    }

    expect(failures, JSON.stringify(failures.slice(0, 3))).toEqual([]);
  });

  it("maksimal yuklamada har so'z mustaqil qidiruvda topiladi", () => {
    const built = buildWordSearch(content(MAX_WORDS), gameSeed("doc-yuklama", 7));
    for (const word of MAX_WORDS) {
      expect(findWord(built.grid, word), `${word} topilmadi`).not.toBeNull();
    }
  });
});

describe("buildWordSearch — determinizm", () => {
  it("bir urug' -> bir panjara", () => {
    expect(buildWordSearch(content(), SEED)).toEqual(buildWordSearch(content(), SEED));
  });

  it("boshqa urug' -> boshqa panjara", () => {
    const a = buildWordSearch(content(), gameSeed("doc-1", 0));
    const b = buildWordSearch(content(), gameSeed("doc-1", 1));
    expect(a.grid).not.toEqual(b.grid);
  });

  it("variant 1 va 2 ham bir-biridan farq qiladi", () => {
    const a = buildWordSearch(content(), gameSeed("doc-1", 1));
    const b = buildWordSearch(content(), gameSeed("doc-1", 2));
    expect(a.grid).not.toEqual(b.grid);
  });

  it("kirish mazmuni O'ZGARTIRILMAYDI", () => {
    const parsed = content();
    const before = JSON.stringify(parsed);
    buildWordSearch(parsed, SEED);
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("so'zlar ro'yxati MAZMUN tartibida qaytadi", () => {
    // Algoritm ichida uzunlik bo'yicha saralanadi, lekin varaqdagi ro'yxat
    // va doskadagi "topilgan" belgisi mazmun tartibida bo'lishi kerak.
    const built = buildWordSearch(content(), SEED);
    expect(built.placed.map((p) => p.word)).toEqual(WORDS);
  });
});

describe("buildWordSearch — vaqt chegarasi", () => {
  it("maksimal yuklamada 200 ms dan tez", () => {
    const parsed = content(MAX_WORDS);
    const start = performance.now();
    for (let i = 0; i < 20; i += 1) {
      buildWordSearch(parsed, gameSeed("doc-vaqt", i));
    }
    const perBuild = (performance.now() - start) / 20;
    expect(perBuild).toBeLessThan(200);
  });
});

describe("segmentBetween", () => {
  it("gorizontal chiziq", () => {
    expect(segmentBetween({ row: 2, col: 1 }, { row: 2, col: 4 })).toEqual([
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ]);
  });

  it("vertikal chiziq", () => {
    expect(segmentBetween({ row: 0, col: 3 }, { row: 2, col: 3 })).toEqual([
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
  });

  it("diagonal chiziq", () => {
    expect(segmentBetween({ row: 0, col: 0 }, { row: 2, col: 2 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
    ]);
  });

  it("teskari yo'nalish ham ishlaydi", () => {
    expect(segmentBetween({ row: 4, col: 4 }, { row: 2, col: 2 })).toEqual([
      { row: 4, col: 4 },
      { row: 3, col: 3 },
      { row: 2, col: 2 },
    ]);
  });

  it("bir xil katak chiziq EMAS", () => {
    expect(segmentBetween({ row: 1, col: 1 }, { row: 1, col: 1 })).toBeNull();
  });

  it("45 gradus bo'lmagan yo'nalish rad etiladi", () => {
    expect(segmentBetween({ row: 0, col: 0 }, { row: 1, col: 3 })).toBeNull();
    expect(segmentBetween({ row: 0, col: 0 }, { row: 3, col: 1 })).toBeNull();
  });

  it("panjaradan tashqari rad etiladi", () => {
    expect(segmentBetween({ row: 0, col: 0 }, { row: 0, col: GRID_SIZE })).toBeNull();
    expect(segmentBetween({ row: 0, col: 0 }, { row: -1, col: 0 })).toBeNull();
  });

  it("sakkizta yo'nalishning hammasi chiziq beradi", () => {
    const mid = { row: 5, col: 5 };
    for (const dir of DIRECTIONS) {
      const to = { row: mid.row + dir.dy * 3, col: mid.col + dir.dx * 3 };
      expect(segmentBetween(mid, to), JSON.stringify(dir)).toHaveLength(4);
    }
  });
});

describe("matchWord", () => {
  const built = buildWordSearch(content(), SEED);

  it("to'g'ri yo'nalishda bosilgan so'zni topadi", () => {
    const placed = built.placed[0]!;
    const last = {
      row: placed.row + placed.direction.dy * (placed.word.length - 1),
      col: placed.col + placed.direction.dx * (placed.word.length - 1),
    };
    const result = matchWord(built.grid, WORDS, { row: placed.row, col: placed.col }, last);
    expect(result?.word).toBe(placed.word);
  });

  it("TESKARI bosilgan so'zni ham topadi", () => {
    // So'z panjaraga bir yo'nalishda yozilgan, lekin bola uni oxiridan
    // boshiga qarab ko'rishi mumkin — bu ham to'g'ri topish.
    const placed = built.placed[0]!;
    const last = {
      row: placed.row + placed.direction.dy * (placed.word.length - 1),
      col: placed.col + placed.direction.dx * (placed.word.length - 1),
    };
    const result = matchWord(built.grid, WORDS, last, { row: placed.row, col: placed.col });
    expect(result?.word).toBe(placed.word);
    // Kataklar so'z o'qilish tartibida qaytadi.
    expect(lettersAt(built.grid, result!.points)).toBe(placed.word);
  });

  it("topilgan so'zni qayta bosish null beradi", () => {
    // `remaining` ro'yxati bo'yicha tekshiriladi, butun lug'at bo'yicha
    // emas — aks holda ball takror bosishdan oshardi.
    const placed = built.placed[0]!;
    const last = {
      row: placed.row + placed.direction.dy * (placed.word.length - 1),
      col: placed.col + placed.direction.dx * (placed.word.length - 1),
    };
    const remaining = WORDS.filter((word) => word !== placed.word);
    expect(matchWord(built.grid, remaining, { row: placed.row, col: placed.col }, last)).toBeNull();
  });

  it("chiziq bo'lmasa null", () => {
    expect(matchWord(built.grid, WORDS, { row: 0, col: 0 }, { row: 1, col: 3 })).toBeNull();
  });
});

describe("findWord", () => {
  it("yo'q so'zni topmaydi", () => {
    const built = buildWordSearch(content(), SEED);
    expect(findWord(built.grid, "ZZZZZZZZZZZZ")).toBeNull();
  });
});
