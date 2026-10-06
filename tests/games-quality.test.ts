import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import { RULES, SCORE_FAIL, scoreDocument } from "@/lib/generation/quality";
import { gameSeed } from "@/lib/games/seed";
import type { GameKind } from "@/lib/games/types";

/**
 * `GAME` turining sifat bahosi.
 *
 * ATAYLAB IKKI QOIDA: `lib/games/content.ts` sxemasi qolgan hamma narsani
 * kafolatlaydi (8 takrorlanmas kategoriya, normallashgan va takrorlanmas
 * so'zlar, 6-12 element). Ularga qoida yozish "biz yozgan kodni biz
 * tekshirdik" holatini yasardi. Shuning uchun quyidagi testlar shu IKKI
 * qoidaning ishlashini va qolganiga qoida YOZILMAGANINI qadaydi.
 */

const TERMS = ["geometriya", "burchak", "kvadrat", "chiziq"];
const SEED = gameSeed("doc-test", 0);

const WORDS = ["CHIZIQ", "UCHBURCHAK", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA", "HAJM"];

function doc(blocks: unknown[]) {
  return DocumentContent.parse({ v: 1, blocks });
}

const heading = { id: "s1-heading-0", type: "heading", level: 1, text: "Geometriya o'yini" };

function wordSearchDoc(words: string[] = WORDS) {
  return doc([
    heading,
    { id: "s1-game-0", type: "game", seed: SEED, content: { kind: "word-search", words } },
  ]);
}

function anagramDoc(clue: (word: string) => string) {
  return doc([
    heading,
    {
      id: "s1-game-0",
      type: "game",
      seed: SEED,
      content: {
        kind: "anagram",
        items: WORDS.slice(0, 6).map((word) => ({ word, clue: clue(word) })),
      },
    },
  ]);
}

function score(content: DocumentContent, itemCount: number, gameKind: GameKind = "word-search") {
  return scoreDocument({
    content,
    spec: { type: "GAME", gameKind, itemCount },
    curriculumTerms: TERMS,
    hasContext: true,
  });
}

const codes = (...args: Parameters<typeof score>) => score(...args).notes.map((note) => note.code);

describe("GAME — element soni", () => {
  it("so'ralganiga teng bo'lsa izoh yo'q", () => {
    expect(codes(wordSearchDoc(), 8)).not.toContain("game_item_count:mismatch");
  });

  it("so'ralganidan kam bo'lsa ERROR beradi", () => {
    // 14 so'zga to'lab 8 ta olish — slayd soni bilan ayni pul masalasi.
    const report = score(wordSearchDoc(), 14);
    expect(report.notes.map((n) => n.code)).toContain("game_item_count:mismatch");
    expect(RULES.game_item_count.severity).toBe("error");
  });

  it("nomuvofiqlik ballni veto chegarasiga tushiradi", () => {
    // `error` og'irligi `ERROR_CEILING` orqali ballni shiftlaydi, ya'ni
    // "to'langan son bilan olingan son farq qildi" holati hujjatni
    // yiqitadi va kredit qaytadi.
    expect(score(wordSearchDoc(), 14).score).toBeLessThan(SCORE_FAIL);
  });

  it("izoh haqiqiy va so'ralgan sonni KO'RSATADI", () => {
    const note = score(wordSearchDoc(), 14).notes.find(
      (n) => n.code === "game_item_count:mismatch",
    );
    expect(note?.message).toContain("8");
    expect(note?.message).toContain("14");
  });
});

describe("GAME — anagramma ta'rifi", () => {
  it("yetarlicha uzun ta'rif izohsiz o'tadi", () => {
    const content = anagramDoc((word) => `${word} nimani bildiradi, tushuntirib bering`);
    expect(codes(content, 6, "anagram")).toEqual([]);
  });

  it("qisqa ta'rif OGOHLANTIRISH beradi", () => {
    const content = anagramDoc(() => "nima?");
    expect(codes(content, 6, "anagram")).toContain("game_clue:short");
    expect(RULES.game_clue_short.severity).toBe("warn");
  });

  it("qisqa ta'rif hujjatni YIQITMAYDI", () => {
    // O'qituvchi ta'rifni o'zi to'ldiradi, o'yin ishlab turadi.
    const content = anagramDoc(() => "nima?");
    expect(score(content, 6, "anagram").score).toBeGreaterThanOrEqual(SCORE_FAIL);
  });

  it("ta'rif o'lchami FAQAT anagrammada ishlaydi", () => {
    // So'z qidirishda ta'rif umuman yo'q, g'ildirakda savol/javob — boshqa
    // turlarda bu o'lcham ballni bekorga ko'tarardi.
    const report = score(wordSearchDoc(), 8);
    expect(report.notes.map((n) => n.code)).not.toContain("game_clue:short");
  });
});

describe("GAME — majburiy bloklar", () => {
  it("sarlavhasiz hujjat izoh beradi", () => {
    const content = doc([
      {
        id: "s1-game-0",
        type: "game",
        seed: SEED,
        content: { kind: "word-search", words: WORDS },
      },
    ]);
    expect(codes(content, 8)).toContain("missing_block:heading");
  });

  it("o'yinsiz hujjat izoh beradi", () => {
    expect(codes(doc([heading]), 8)).toContain("missing_block:game");
  });
});

describe("GAME — sxema kafolatlagan narsaga qoida YO'Q", () => {
  it("toza hujjat hech qanday izoh bermaydi", () => {
    // Agar bu yerda izoh paydo bo'lsa, demak sxema allaqachon
    // kafolatlagan narsaga qoida yozilgan — ball to'qib beriladi.
    const report = score(wordSearchDoc(), 8);
    expect(report.notes).toEqual([]);
    expect(report.cappedByError).toBe(false);
  });

  it("har izohning qoidasi RULES da ro'yxatdan o'tgan", () => {
    for (const note of score(wordSearchDoc(), 14).notes) {
      expect(RULES[note.rule]).toBeDefined();
      expect(note.severity).toBe(RULES[note.rule].severity);
    }
  });
});
