import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import { documentHeading, firstGameBlock } from "@/lib/games/document";
import { gameSeed } from "@/lib/games/seed";
import { GAME_KINDS } from "@/lib/games/types";
import {
  DEFAULT_VARIANT,
  MAX_VARIANT,
  readVariant,
  seedForVariant,
  VARIANT_PARAM,
  VARIANTS,
  variantHref,
} from "@/lib/games/variant-params";

const ROOT = join(__dirname, "..");
const SEED = gameSeed("doc-1", 0);

/* ------------------------------------------------------------------ */
/* `?variant=N`                                                        */
/* ------------------------------------------------------------------ */

describe("readVariant", () => {
  it("parametr yo'q bo'lsa 0", () => {
    expect(readVariant({})).toBe(DEFAULT_VARIANT);
  });

  it.each([0, 1, 2, 3])("%i o'qiladi", (value) => {
    expect(readVariant({ [VARIANT_PARAM]: String(value) })).toBe(value);
  });

  /**
   * TEMIR QOIDA: buzuq qiymat HECH QACHON throw qilmaydi — jimgina
   * 0-variantga tushadi. Ulashilgan havola qo'lda tahrirlanadi va buzuq
   * URL dars o'rtasida xato ekrani ko'rsatmasligi kerak.
   */
  it.each([
    ["abc", "harf"],
    ["", "bo'sh"],
    ["-1", "manfiy"],
    ["4", "shiftdan yuqori"],
    ["999", "juda katta"],
    ["1.5", "kasr"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["1e2", "ekspon"],
    ["constructor", "prototip kaliti"],
    ["__proto__", "prototip kaliti"],
  ])("%s -> 0 (%s)", (value) => {
    expect(readVariant({ [VARIANT_PARAM]: value })).toBe(DEFAULT_VARIANT);
  });

  it('"2abc" 2 DEB O\'QILMAYDI', () => {
    // `Number.parseInt` buni 2 deb o'qiydi, ya'ni buzuq URL jimgina
    // "to'g'ri" variant berardi. `Number()` esa `NaN` qaytaradi.
    expect(readVariant({ [VARIANT_PARAM]: "2abc" })).toBe(DEFAULT_VARIANT);
  });

  it("massiv qiymat ham throw qilmaydi", () => {
    expect(() => readVariant({ [VARIANT_PARAM]: ["1", "2"] })).not.toThrow();
  });
});

describe("seedForVariant", () => {
  it("0-variant BLOKDAGI urug'ni qaytaradi", () => {
    // Blokdagi qiymatni ishlatish blokni o'z-o'zicha to'liq qiladi:
    // hujjat boshqa joyda ochilsa ham ayni o'yin chiqadi.
    expect(seedForVariant({ documentId: "doc-1", blockSeed: 12345, variant: 0 })).toBe(12345);
  });

  it("boshqa variant boshqa urug' beradi", () => {
    const seeds = VARIANTS.map((variant) =>
      seedForVariant({ documentId: "doc-1", blockSeed: SEED, variant }),
    );
    expect(new Set(seeds).size).toBe(VARIANTS.length);
  });

  it("deterministik", () => {
    const args = { documentId: "doc-1", blockSeed: SEED, variant: 2 };
    expect(seedForVariant(args)).toBe(seedForVariant(args));
  });

  it("boshqa hujjat boshqa urug'", () => {
    expect(seedForVariant({ documentId: "doc-1", blockSeed: SEED, variant: 2 })).not.toBe(
      seedForVariant({ documentId: "doc-2", blockSeed: SEED, variant: 2 }),
    );
  });
});

describe("variantHref", () => {
  it("0 uchun parametr YOZILMAYDI", () => {
    expect(variantHref("/ish/hujjat/x/oyin", 0)).toBe("/ish/hujjat/x/oyin");
  });

  it("boshqa variant uchun parametr qo'shiladi", () => {
    expect(variantHref("/ish/hujjat/x/varaq", 2)).toBe(`/ish/hujjat/x/varaq?${VARIANT_PARAM}=2`);
  });

  it("qurilgan havola qaytib o'qiladi", () => {
    for (const variant of VARIANTS) {
      const href = variantHref("/p", variant);
      const query = href.includes("?") ? href.split("?")[1]! : "";
      const raw = Object.fromEntries(new URLSearchParams(query));
      expect(readVariant(raw)).toBe(variant);
    }
  });
});

describe("VARIANTS", () => {
  it("to'rtta variant — spetsifikatsiyadagi 4-variant g'oyasi", () => {
    expect(VARIANTS).toEqual([0, 1, 2, 3]);
    expect(MAX_VARIANT).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* Hujjatdan blok ajratish                                             */
/* ------------------------------------------------------------------ */

const gameBlock = {
  id: "s1-game-0",
  type: "game" as const,
  seed: SEED,
  content: {
    kind: "anagram" as const,
    items: ["CHIZIQ", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA"].map((word) => ({
      word,
      clue: `${word} nimani bildiradi?`,
    })),
  },
};

describe("firstGameBlock", () => {
  it("o'yin blokini topadi", () => {
    const content = DocumentContent.parse({
      v: 1,
      blocks: [
        { id: "s1-heading-0", type: "heading", level: 1, text: "Geometriya" },
        gameBlock,
      ],
    });
    expect(firstGameBlock(content)?.id).toBe("s1-game-0");
  });

  it("o'yinsiz hujjatda null", () => {
    const content = DocumentContent.parse({
      v: 1,
      blocks: [{ id: "h", type: "heading", level: 1, text: "Geometriya" }],
    });
    expect(firstGameBlock(content)).toBeNull();
  });

  it("ikki blok bo'lsa BIRINCHISINI oladi", () => {
    // Sxema bitta blokni qulflamaydi (`blocks.ts` izohi), shuning uchun
    // pleyer birinchisini oladi va sahifa ishlashda davom etadi.
    const content = DocumentContent.parse({
      v: 1,
      blocks: [gameBlock, { ...gameBlock, id: "s1-game-1" }],
    });
    expect(firstGameBlock(content)?.id).toBe("s1-game-0");
  });
});

describe("documentHeading", () => {
  it("birinchi sarlavhani qaytaradi", () => {
    const content = DocumentContent.parse({
      v: 1,
      blocks: [
        { id: "h1", type: "heading", level: 1, text: "Geometriya o'yini" },
        gameBlock,
        { id: "h2", type: "heading", level: 2, text: "Ikkinchi" },
      ],
    });
    expect(documentHeading(content)).toBe("Geometriya o'yini");
  });

  it("sarlavhasiz hujjatda null", () => {
    const content = DocumentContent.parse({ v: 1, blocks: [gameBlock] });
    expect(documentHeading(content)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Komponent reyestri — matn darajasida                                */
/* ------------------------------------------------------------------ */

/**
 * NEGA IMPORT QILIB EMAS: `components/games/registry.tsx` React va
 * `next-intl` ga bog'lanadi, vitest esa `environment: "node"` da ishlaydi
 * (jsdom ham, RTL ham yo'q).
 *
 * Switch'ning TO'LIQLIGINI `tsc` qo'riqlaydi (`: ReactElement`
 * annotatsiyasi bilan — 15-sessiyada annotatsiyasiz "default yo'q"
 * kafolati umuman ishlamaganini topdik). Lekin kimdir `default` tarmoq
 * qo'shsa, annotatsiyani olib tashlasa yoki faylni butunlay unutsa `tsc`
 * jim qolardi — shuning uchun matn skaneri ikkinchi to'r bo'lib turadi.
 *
 * "Yarim qo'shilgan o'yin CI'ni yiqitsin" — spetsifikatsiya talabi.
 */
describe("komponent reyestri", () => {
  const source = readFileSync(join(ROOT, "components/games/registry.tsx"), "utf-8");

  it.each(GAME_KINDS)("%s uchun tarmoq bor", (kind) => {
    // Har `kind` IKKI MARTA uchraydi: doska va varaq switch'larida.
    const matches = source.split(`case "${kind}"`).length - 1;
    expect(matches, `"${kind}" tarmog'i yetishmaydi`).toBeGreaterThanOrEqual(2);
  });

  it("default tarmog'i YO'Q", () => {
    expect(source).not.toMatch(/^\s*default:/m);
  });

  it("qaytish turi annotatsiya qilingan", () => {
    // Annotatsiyasiz yetishmagan `case` jimgina `undefined` qaytaradi va
    // o'yin ekranda yo'qoladi — `tsc` esa xato bermaydi.
    expect(source).toContain("): ReactElement");
  });

  it("doska komponentlari klient, varaq komponentlari server", () => {
    for (const relPath of [
      "components/games/board/wheel-board.tsx",
      "components/games/board/word-search-board.tsx",
      "components/games/board/anagram-board.tsx",
      "components/games/board/score.tsx",
      "components/games/print-button.tsx",
    ]) {
      const text = readFileSync(join(ROOT, relPath), "utf-8");
      // Klient daraxtidagi HAR fayl direktivaga ega bo'lishi kerak:
      // `client-props-guard` direktivasiz faylni server komponent deb
      // biladi va unga uzatilgan funksiya prop'ini o'tkazib yuborardi.
      expect(text.trimStart().startsWith('"use client"'), relPath).toBe(true);
    }

    for (const relPath of [
      "components/games/registry.tsx",
      "components/games/print/word-search-sheet.tsx",
      "components/games/print/anagram-sheet.tsx",
    ]) {
      const text = readFileSync(join(ROOT, relPath), "utf-8");
      expect(text.trimStart().startsWith('"use client"'), relPath).toBe(false);
    }
  });

  it("doskalar teginish nishonini CSS'da e'lon qiladi", () => {
    // Spetsifikatsiya: nishonlar >= 60 px (barmoq uchun).
    const css = readFileSync(join(ROOT, "components/games/games.css"), "utf-8");
    for (const selector of [".game-action", ".ana-tile", ".ana-slot"]) {
      const block = css.slice(css.indexOf(selector));
      expect(block.slice(0, 300), selector).toContain("60px");
    }
  });

  it("varaq CSS'i A4 va alohida javob sahifasini belgilaydi", () => {
    const css = readFileSync(join(ROOT, "components/games/games.css"), "utf-8");
    expect(css).toContain("size: A4 portrait");
    expect(css).toMatch(/\.game-answers\s*\{[^}]*break-before:\s*page/);
    expect(css).toMatch(/\.game-chrome\s*\{[^}]*display:\s*none/);
  });
});
