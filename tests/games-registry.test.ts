import { describe, expect, it } from "vitest";
import { creditCost, GAME_LIMITS } from "@/lib/credits/cost-table";
import { AnagramContent, WheelContent, WordSearchContent } from "@/lib/games/content";
import {
  buildGame,
  GAME_KIND_PARAM,
  GAME_LIST,
  GAMES,
  gameKindFor,
  paramForGameKind,
  readGameKindParam,
} from "@/lib/games/registry";
import { gameSeed } from "@/lib/games/seed";
import { GAME_KINDS, type GameContent, type GameKind } from "@/lib/games/types";

/**
 * Reyestr — "yarim qo'shilgan o'yin CI'ni yiqitsin" qorovuli.
 *
 * `Record<GameKind, ...>` TypeScript darajasida yetishmagan kalitni
 * ushlaydi, lekin bo'sh yoki ma'nosiz yozuvni ushlamaydi. Bu test har
 * `kind` uchun BARCHA qismlar borligini va ishlayotganini qadaydi.
 */

const SEED = gameSeed("doc-1", 0);

const SAMPLE: { [K in GameKind]: Extract<GameContent, { kind: K }> } = {
  wheel: WheelContent.parse({
    kind: "wheel",
    sectors: Array.from({ length: 8 }, (_, i) => ({
      category: `Kategoriya ${String(i)}`,
      question: `Savol ${String(i)}?`,
      answer: `Javob ${String(i)}`,
    })),
  }),
  "word-search": WordSearchContent.parse({
    kind: "word-search",
    words: ["CHIZIQ", "UCHBURCHAK", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA", "HAJM"],
  }),
  anagram: AnagramContent.parse({
    kind: "anagram",
    items: ["CHIZIQ", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA"].map((word) => ({
      word,
      clue: `${word} nimani bildiradi?`,
    })),
  }),
};

describe("GAMES reyestri — har kind to'liq", () => {
  it.each(GAME_KINDS)("%s yozuvi to'liq", (kind) => {
    const entry = GAMES[kind];
    expect(entry).toBeDefined();
    expect(entry.contentSchema).toBeDefined();
    expect(typeof entry.build).toBe("function");
    expect(typeof entry.cost).toBe("function");
    expect(typeof entry.hasSheet).toBe("boolean");
    expect(entry.limits).toBeDefined();
  });

  it.each(GAME_KINDS)("%s chegarasi GAME_LIMITS ning O'ZI", (kind) => {
    // Nusxa emas, aynan bir obyekt: ikkita haqiqat manbai bo'lsa
    // o'qituvchi ko'rgan narx bilan yechilgan kredit farq qilardi.
    expect(GAMES[kind].limits).toBe(GAME_LIMITS[kind]);
  });

  it.each(GAME_KINDS)("%s narxi creditCost bilan bir xil", (kind) => {
    const { min, max } = GAME_LIMITS[kind];
    for (const itemCount of [min, max]) {
      expect(GAMES[kind].cost(itemCount)).toBe(
        creditCost({ type: "GAME", gameKind: kind, itemCount }),
      );
    }
  });

  it.each(GAME_KINDS)("%s sxemasi o'z mazmunini qabul qiladi", (kind) => {
    expect(GAMES[kind].contentSchema.safeParse(SAMPLE[kind]).success).toBe(true);
  });

  it.each(GAME_KINDS)("%s sxemasi BOSHQA kind mazmunini rad etadi", (kind) => {
    for (const other of GAME_KINDS) {
      if (other === kind) continue;
      expect(GAMES[kind].contentSchema.safeParse(SAMPLE[other]).success).toBe(false);
    }
  });

  it.each(GAME_KINDS)("%s build o'z kind ini qaytaradi", (kind) => {
    const built = buildGame(SAMPLE[kind], SEED);
    expect(built.kind).toBe(kind);
  });

  it.each(GAME_KINDS)("%s build deterministik", (kind) => {
    expect(buildGame(SAMPLE[kind], SEED)).toEqual(buildGame(SAMPLE[kind], SEED));
  });

  it.each(GAME_KINDS)("%s build boshqa urug'da boshqa natija", (kind) => {
    const a = buildGame(SAMPLE[kind], gameSeed("doc-1", 0));
    const b = buildGame(SAMPLE[kind], gameSeed("doc-1", 1));
    expect(a).not.toEqual(b);
  });

  it("GAME_LIST GAME_KINDS tartibida", () => {
    expect(GAME_LIST.map((entry) => entry.kind)).toEqual([...GAME_KINDS]);
  });

  it("faqat g'ildirakda varaq yo'q", () => {
    // Spetsifikatsiya: g'ildirak uchun "Varaq yo'q". Bayroq UCH joyni
    // boshqaradi (varaq marshruti, muharrir kartasi, hujjat ko'rinishi).
    expect(GAMES.wheel.hasSheet).toBe(false);
    expect(GAMES["word-search"].hasSheet).toBe(true);
    expect(GAMES.anagram.hasSheet).toBe(true);
  });
});

describe("URL taxalluslari", () => {
  it("har kind uchun taxallus bor va teskarisi ham ishlaydi", () => {
    for (const kind of GAME_KINDS) {
      const param = paramForGameKind(kind);
      expect(param).toBeDefined();
      expect(gameKindFor(param)).toBe(kind);
    }
  });

  it("taxalluslar takrorlanmaydi", () => {
    const params = GAME_KINDS.map(paramForGameKind);
    expect(new Set(params).size).toBe(GAME_KINDS.length);
  });

  it("GAME_KIND_PARAM va PARAM_BY_KIND bir-biriga mos", () => {
    for (const [param, kind] of Object.entries(GAME_KIND_PARAM)) {
      expect(paramForGameKind(kind)).toBe(param);
    }
  });

  it.each(["gildirak", "soz-qidirish", "anagramma"])("%s o'qiladi", (value) => {
    expect(readGameKindParam(value)).toBe(value);
  });

  it.each([null, "", "wheel", "crossword", "GILDIRAK"])("%s rad etiladi", (value) => {
    expect(readGameKindParam(value)).toBeNull();
  });

  it("prototip ifloslanishidan himoyalangan", () => {
    // `in` prototip zanjirini kezadi, ya'ni `?oyin=constructor` kabi
    // qiymat "mavjud" bo'lib chiqardi. `Object.hasOwn` ishlatiladi.
    for (const value of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(readGameKindParam(value), value).toBeNull();
    }
  });
});

// KOMPONENT REYESTRI (`components/games/registry.tsx`) matn darajasida
// tekshiriladi — u pleyerlar bilan birga qo'shiladi, shuning uchun o'sha
// tekshiruv `tests/games-players.test.ts` da yashaydi.
