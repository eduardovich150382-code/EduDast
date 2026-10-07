import { describe, expect, it } from "vitest";
import { Block, BLOCK_TYPES, DocumentContent } from "@/lib/documents/blocks";
import { renderBlock, renderDocument } from "@/lib/documents/render";
import { gameItemCount } from "@/lib/games/content";
import { gameSeed } from "@/lib/games/seed";
import { GAME_KINDS } from "@/lib/games/types";

/**
 * `game` bloki — sxema, matn ko'rinishi va element sanog'i.
 *
 * Bu test hujjat QATLAMIni qamraydi; algoritmlar o'z fayllarida
 * (`games-word-search.test.ts` va hokazo).
 */

const SEED = gameSeed("doc-test", 0);

const wheelBlock = {
  id: "s1-game-0",
  type: "game" as const,
  seed: SEED,
  content: {
    kind: "wheel" as const,
    sectors: Array.from({ length: 8 }, (_, i) => ({
      category: `Kategoriya ${String(i)}`,
      question: `Savol ${String(i)}?`,
      answer: `Javob ${String(i)}`,
    })),
  },
};

const wordSearchBlock = {
  id: "s1-game-0",
  type: "game" as const,
  seed: SEED,
  content: {
    kind: "word-search" as const,
    words: ["CHIZIQ", "UCHBURCHAK", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA", "HAJM"],
  },
};

const anagramBlock = {
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

const ALL = [wheelBlock, wordSearchBlock, anagramBlock];

describe("game bloki sxemasi", () => {
  it("BLOCK_TYPES ichida bor", () => {
    expect(BLOCK_TYPES).toContain("game");
  });

  it.each(ALL.map((block) => [block.content.kind, block] as const))(
    "%s mazmunli blok parse bo'ladi",
    (_kind, block) => {
      const parsed = Block.safeParse(block);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
    },
  );

  it("yuqori darajadagi kind QABUL QILINMAYDI", () => {
    // Diskriminator FAQAT `content` ichida. Blokka `kind` qo'shish ikkinchi
    // haqiqat manbai bo'lardi, `strictObject` esa uni rad etadi — ya'ni eski
    // shakldagi blok jimgina yozilib qolmaydi.
    expect(Block.safeParse({ ...wheelBlock, kind: "wheel" }).success).toBe(false);
  });

  it("manfiy urug' rad etiladi", () => {
    expect(Block.safeParse({ ...anagramBlock, seed: -1 }).success).toBe(false);
  });

  it("32-bitdan katta urug' rad etiladi", () => {
    expect(Block.safeParse({ ...anagramBlock, seed: 0x1_0000_0000 }).success).toBe(false);
  });

  it("kasr urug' rad etiladi", () => {
    expect(Block.safeParse({ ...anagramBlock, seed: 1.5 }).success).toBe(false);
  });

  it("urug'siz blok rad etiladi", () => {
    // `seed` IXTIYORIY EMAS: u bo'lmasa panjara har render'da boshqa chiqib,
    // "bitta hujjat -> bitta o'yin" kafolati buzilardi.
    const withoutSeed: Record<string, unknown> = { ...anagramBlock };
    delete withoutSeed.seed;
    expect(Block.safeParse(withoutSeed).success).toBe(false);
  });

  it("hujjat ichida parse bo'ladi", () => {
    const content = DocumentContent.safeParse({
      v: 1,
      blocks: [{ id: "s1-heading-0", type: "heading", level: 1, text: "Geometriya" }, anagramBlock],
    });
    expect(content.error?.issues ?? []).toEqual([]);
    expect(content.success).toBe(true);
  });
});

describe("gameItemCount", () => {
  it.each([
    ["wheel", wheelBlock.content, 8],
    ["word-search", wordSearchBlock.content, 8],
    ["anagram", anagramBlock.content, 6],
  ] as const)("%s -> %i", (_kind, content, expected) => {
    expect(gameItemCount(content)).toBe(expected);
  });

  it("uchala kind qamrab olingan", () => {
    // `gameItemCount` da `default` tarmog'i yo'q, lekin bu test ro'yxatning
    // o'zi to'liqligini ham qadaydi.
    const covered = ALL.map((block) => block.content.kind);
    expect([...covered].sort()).toEqual([...GAME_KINDS].sort());
  });
});

describe("renderBlock — game", () => {
  it("g'ildirakda kategoriya, savol va javob chiqadi", () => {
    const text = renderBlock(Block.parse(wheelBlock));
    expect(text).toContain("Kategoriya 0");
    expect(text).toContain("Savol 0?");
    expect(text).toContain("Javob 0");
  });

  it("so'z qidirishda har so'z ALOHIDA satrda", () => {
    // Bir satrga qo'shilsa sifat bahosidagi "juda uzun jumla" qoidasi
    // noto'g'ri ishga tushardi.
    const lines = renderBlock(Block.parse(wordSearchBlock)).split("\n");
    expect(lines).toEqual(wordSearchBlock.content.words);
  });

  it("anagrammada so'z va ta'rif chiqadi", () => {
    const text = renderBlock(Block.parse(anagramBlock));
    expect(text).toContain("CHIZIQ");
    expect(text).toContain("CHIZIQ nimani bildiradi?");
  });

  it("PANJARA chiqmaydi", () => {
    // Panjara `seed` dan hisoblanadigan tasodifiy harflar to'plami: matnga
    // qo'shilsa kalit so'z qamrovi va markdown detektori harflar ustida
    // ma'nosiz ishlardi, eksport matni ham o'qilmas bo'lardi.
    const text = renderBlock(Block.parse(wordSearchBlock));
    expect(text.length).toBeLessThan(200);
  });

  it("YORLIQ chiqmaydi", () => {
    // `lib/` ichida hardcode matn yo'q (1-qoida): "Savol:", "Javob:" kabi
    // yorliq ko'rsatish qatlamining ishi.
    const text = renderBlock(Block.parse(anagramBlock));
    expect(text).not.toMatch(/Ta'rif:|Savol:|Javob:|So'z:/);
  });

  it("deterministik", () => {
    const once = renderBlock(Block.parse(anagramBlock));
    expect(renderBlock(Block.parse(anagramBlock))).toBe(once);
  });

  it("hujjat matniga qo'shiladi", () => {
    const content = DocumentContent.parse({
      v: 1,
      blocks: [{ id: "s1-heading-0", type: "heading", level: 1, text: "Geometriya" }, anagramBlock],
    });
    const text = renderDocument(content);
    expect(text).toContain("Geometriya");
    expect(text).toContain("KVADRAT");
  });
});
