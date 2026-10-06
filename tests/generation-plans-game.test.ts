import { describe, expect, it } from "vitest";
import { GAME_LIMITS } from "@/lib/credits/cost-table";
import { Block } from "@/lib/documents/blocks";
import { GameContent } from "@/lib/games/content";
import { MAX_TOTAL_LETTERS } from "@/lib/games/grid";
import { gameSeed } from "@/lib/games/seed";
import { GAME_KINDS } from "@/lib/games/types";
import {
  AnagramOut,
  buildGamePlan,
  checkGameContent,
  gameBlocks,
  gameContentFrom,
  gameStageInstruction,
  WheelOut,
  WordSearchOut,
  type GameOut,
} from "@/lib/generation/plans-game";
import { stagePurpose } from "@/lib/generation/plans";

/**
 * `GAME` konveyerining o'yinga xos qismi.
 *
 * ENG MUHIM TEST — "normalizatsiyadan keyin son yetmasa darvoza yiqitadi":
 * modelning xom javobida 14 so'z bo'lib, uchtasi yaroqsiz bo'lsa panjaraga
 * 11 ta tushardi. O'qituvchi 14 ta uchun to'lagan bo'lardi, `quality.ts`
 * esa hujjatni oxirida yiqitardi — krediti ALLAQACHON yechilgandan keyin.
 */

const SPEC = buildGamePlan().stages[0]!;
const SEED = gameSeed("doc-1", 0);

describe("buildGamePlan", () => {
  it("bitta content bosqichi", () => {
    const plan = buildGamePlan();
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]).toEqual({ id: "1", kind: "content" });
  });

  it("purpose game: prefiksini beradi", () => {
    // Marja tahlili shu kalit bo'yicha guruhlanadi.
    expect(stagePurpose(SPEC, "game")).toBe("game:stage-1");
  });
});

describe("chiqish sxemalari — TEKIS va union'siz", () => {
  it("sarlavha har uchalasida majburiy", () => {
    expect(WheelOut.safeParse({ sectors: [] }).success).toBe(false);
    expect(WordSearchOut.safeParse({ words: [] }).success).toBe(false);
    expect(AnagramOut.safeParse({ items: [] }).success).toBe(false);
  });

  it("so'z maydoni NORMALLASHGAN shaklni talab QILMAYDI", () => {
    // Modeldan `OQUVCHI` talab qilish javobni yaroqsiz qilib yiqitardi:
    // model tabiiy ravishda "o'quvchi" deb yozadi. Tozalash `gameBlocks` da.
    const parsed = WordSearchOut.safeParse({
      title: "Geometriya",
      words: ["o'quvchi", "chiziq", "KVADRAT", "doira"],
    });
    expect(parsed.success).toBe(true);
  });

  it("noma'lum kalit rad etiladi", () => {
    expect(
      WordSearchOut.safeParse({ title: "Namuna sarlavha", words: ["chiziq"], extra: 1 }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Namuna javoblar                                                     */
/* ------------------------------------------------------------------ */

const wheelOut: GameOut = {
  kind: "wheel",
  out: WheelOut.parse({
    title: "Geometriya g'ildiragi",
    sectors: Array.from({ length: 8 }, (_, i) => ({
      category: `Kategoriya ${String(i)}`,
      question: `Savol ${String(i)} haqida?`,
      answer: `Javob ${String(i)}`,
    })),
  }),
};

const wordSearchOut: GameOut = {
  kind: "word-search",
  out: WordSearchOut.parse({
    title: "Geometriya so'zlari",
    words: [
      "chiziq",
      "uchburchak",
      "kvadrat",
      "doira",
      "burchak",
      "tomon",
      "yuza",
      "hajm",
    ],
  }),
};

const anagramOut: GameOut = {
  kind: "anagram",
  out: AnagramOut.parse({
    title: "Geometriya anagrammasi",
    items: ["chiziq", "kvadrat", "doira", "burchak", "tomon", "yuza"].map((word) => ({
      word,
      clue: `${word} nimani bildiradi?`,
    })),
  }),
};

describe("gameContentFrom — normalizatsiya", () => {
  it("apostrof va kichik harf tozalanadi", () => {
    const out: GameOut = {
      kind: "word-search",
      out: WordSearchOut.parse({
        title: "Namuna sarlavha",
        words: ["o'quvchi", "chiziq", "g'isht", "doira", "tomon", "yuza", "hajm", "burchak"],
      }),
    };
    const content = gameContentFrom(out, 8);
    expect(content.kind).toBe("word-search");
    if (content.kind !== "word-search") throw new Error("kind");
    expect(content.words).toContain("OQUVCHI");
    expect(content.words).toContain("CHIZIQ");
    expect(content.words).toContain("GISHT");
  });

  it("YAROQSIZ so'z tashlanadi", () => {
    const out: GameOut = {
      kind: "word-search",
      out: WordSearchOut.parse({
        title: "Namuna sarlavha",
        words: ["window", "issiq havo", "test 1", "chiziq", "doira"],
      }),
    };
    const content = gameContentFrom(out, 5);
    if (content.kind !== "word-search") throw new Error("kind");
    expect(content.words).toEqual(["CHIZIQ", "DOIRA"]);
  });

  it("takrorlangan so'z tashlanadi", () => {
    const out: GameOut = {
      kind: "word-search",
      out: WordSearchOut.parse({
        title: "Namuna sarlavha",
        words: ["chiziq", "CHIZIQ", "Chiziq", "doira"],
      }),
    };
    const content = gameContentFrom(out, 4);
    if (content.kind !== "word-search") throw new Error("kind");
    expect(content.words).toEqual(["CHIZIQ", "DOIRA"]);
  });

  it("natija MAZMUN SXEMASIDAN o'tadi", () => {
    for (const out of [wheelOut, wordSearchOut, anagramOut]) {
      const itemCount = out.kind === "wheel" ? 8 : out.kind === "word-search" ? 8 : 6;
      const parsed = GameContent.safeParse(gameContentFrom(out, itemCount));
      expect(parsed.error?.issues ?? [], out.kind).toEqual([]);
    }
  });

  it("ortiqcha element TASHLANADI", () => {
    const content = gameContentFrom(anagramOut, 6);
    if (content.kind !== "anagram") throw new Error("kind");
    expect(content.items).toHaveLength(6);
  });

  it("jami harf shiftidan oshgan so'zlar chiqariladi", () => {
    // Model shiftni promptda ko'radi, lekin buzishi mumkin. Eng UZUN
    // so'zlar tashlanadi — natija sxemadan o'tishi kerak.
    const long = Array.from({ length: 14 }, (_, i) =>
      Array.from({ length: 10 }, (_, j) => "ABDEFGHIJKLMNOPQRSTUVXYZ"[(i * 7 + j * 3) % 24]!).join(
        "",
      ),
    );
    const out: GameOut = {
      kind: "word-search",
      out: WordSearchOut.parse({ title: "Namuna sarlavha", words: long }),
    };
    const content = gameContentFrom(out, 14);
    if (content.kind !== "word-search") throw new Error("kind");
    const total = content.words.reduce((sum, word) => sum + word.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_LETTERS);
  });
});

describe("checkGameContent — darvoza", () => {
  it("to'liq javob o'tadi", () => {
    expect(checkGameContent(wheelOut, 8).ok).toBe(true);
    expect(checkGameContent(wordSearchOut, 8).ok).toBe(true);
    expect(checkGameContent(anagramOut, 6).ok).toBe(true);
  });

  it("so'ralganidan kam element YIQITADI", () => {
    const gate = checkGameContent(wordSearchOut, 14);
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error("gate");
    expect(gate.reason).toContain("8");
    expect(gate.reason).toContain("14");
  });

  /**
   * ENG MUHIM HOLAT: xom son yetarli, NORMALIZATSIYADAN KEYIN yetmaydi.
   *
   * Darvoza xom sonni sanasa bosqich o'tib ketardi, kredit yechilardi va
   * hujjat `quality.ts` da yiqilardi — pul allaqachon ketgandan keyin.
   */
  it("normalizatsiyadan KEYIN yetmagan son yiqitadi", () => {
    const out: GameOut = {
      kind: "word-search",
      out: WordSearchOut.parse({
        title: "Namuna sarlavha",
        words: [
          "chiziq",
          "doira",
          "tomon",
          "yuza",
          "hajm",
          "burchak",
          "window", // `w` — yaroqsiz
          "issiq havo", // ikki so'z — yaroqsiz
        ],
      }),
    };
    // Xom son 8, yaroqlisi 6.
    expect(out.out.words).toHaveLength(8);
    const gate = checkGameContent(out, 8);
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error("gate");
    expect(gate.reason).toContain("6");
  });

  it("ortiqcha element YIQITMAYDI", () => {
    const out: GameOut = {
      kind: "anagram",
      out: AnagramOut.parse({
        title: "Namuna sarlavha",
        items: ["chiziq", "kvadrat", "doira", "burchak", "tomon", "yuza", "hajm", "asos"].map(
          (word) => ({ word, clue: `${word} nima?` }),
        ),
      }),
    };
    expect(checkGameContent(out, 6).ok).toBe(true);
  });
});

describe("gameBlocks", () => {
  it("sarlavha va o'yin bloki qaytaradi", () => {
    const blocks = gameBlocks(SPEC, { result: wordSearchOut, itemCount: 8, seed: SEED });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[1]?.type).toBe("game");
  });

  it("sarlavha modeldan olinadi", () => {
    const blocks = gameBlocks(SPEC, { result: wordSearchOut, itemCount: 8, seed: SEED });
    const heading = blocks[0];
    if (heading?.type !== "heading") throw new Error("heading");
    expect(heading.text).toBe("Geometriya so'zlari");
  });

  it("urug' blokka yoziladi", () => {
    const blocks = gameBlocks(SPEC, { result: wordSearchOut, itemCount: 8, seed: SEED });
    const game = blocks[1];
    if (game?.type !== "game") throw new Error("game");
    expect(game.seed).toBe(SEED);
  });

  it("bloklar BLOK SXEMASIDAN o'tadi", () => {
    for (const [result, itemCount] of [
      [wheelOut, 8],
      [wordSearchOut, 8],
      [anagramOut, 6],
    ] as const) {
      for (const block of gameBlocks(SPEC, { result, itemCount, seed: SEED })) {
        const parsed = Block.safeParse(block);
        expect(parsed.error?.issues ?? [], `${result.kind}/${block.type}`).toEqual([]);
      }
    }
  });

  it("blok id lari takrorlanmaydi", () => {
    const blocks = gameBlocks(SPEC, { result: anagramOut, itemCount: 6, seed: SEED });
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it("deterministik", () => {
    const once = gameBlocks(SPEC, { result: anagramOut, itemCount: 6, seed: SEED });
    expect(gameBlocks(SPEC, { result: anagramOut, itemCount: 6, seed: SEED })).toEqual(once);
  });
});

describe("gameStageInstruction", () => {
  it.each(GAME_KINDS)("%s uchun so'ralgan sonni aytadi", (kind) => {
    const itemCount = GAME_LIMITS[kind].min;
    const text = gameStageInstruction({ kind, itemCount });
    expect(text).toContain(String(itemCount));
  });

  it("so'z qidirishda panjara SO'RALMAYDI", () => {
    const text = gameStageInstruction({ kind: "word-search", itemCount: 10 });
    expect(text).toContain("PANJARANI TUZMA");
  });

  it("anagrammada aralashtirish SO'RALMAYDI", () => {
    const text = gameStageInstruction({ kind: "anagram", itemCount: 8 });
    expect(text).toContain("ARALASHTIRMA");
  });

  it("uchala tur boshqa ko'rsatma beradi", () => {
    const texts = GAME_KINDS.map((kind) => gameStageInstruction({ kind, itemCount: 8 }));
    expect(new Set(texts).size).toBe(GAME_KINDS.length);
  });
});
