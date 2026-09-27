import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import { scoreDocument, SCORE_FAIL, SCORE_WARN } from "@/lib/generation/quality";

/**
 * Sifat bahosi — `fixtures/documents/` dagi namunalar ustida.
 *
 * Namunalar FAYLDA, testda inline emas: ular haqiqiy generatsiya
 * chiqishiga o'xshash hajmda va inline yozilsa test o'qilmas bo'lib
 * ketardi. Fayl shakli buzilsa `DocumentContent.parse` darhol yiqiladi.
 */

const DURATION = 45;

/** Namunalardagi mavzuning rasmiy kurikulum atamalari. */
const TERMS = ["tezlanish", "harakat", "tezlik", "formula"];

function load(name: string) {
  const raw = readFileSync(join(__dirname, "..", "fixtures", "documents", name), "utf-8");
  // `parse`, `safeParse` emas: namuna buzuq bo'lsa test AYNI shu yerda
  // yiqilsin, keyinroq tushunarsiz ball farqi bilan emas.
  return DocumentContent.parse(JSON.parse(raw));
}

function score(name: string, terms: string[] = TERMS) {
  return scoreDocument({
    content: load(name),
    durationMinutes: DURATION,
    curriculumTerms: terms,
  });
}

function codes(name: string, terms: string[] = TERMS): string[] {
  return score(name, terms).notes.map((note) => note.code);
}

describe("yaxshi namuna", () => {
  it("yuqori ball oladi va ogohlantirishsiz o'tadi", () => {
    const report = score("yaxshi.json");
    expect(report.score).toBeGreaterThanOrEqual(SCORE_WARN);
  });

  it("struktura va til to'liq ball", () => {
    const report = score("yaxshi.json");
    expect(report.parts.structure).toBe(1);
    expect(report.parts.language).toBe(1);
  });

  it("ball 0 va 1 oralig'ida", () => {
    const report = score("yaxshi.json");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(1);
  });
});

describe("daqiqalari qochgan namuna", () => {
  it("minutes:drift belgilanadi", () => {
    // 10+10+10+10 = 40, so'ralgani 45 -> 11 % > 10 % chegara.
    expect(codes("daqiqa-qochgan.json")).toContain("minutes:drift");
  });

  it("yaxshi namunadan past ball oladi", () => {
    expect(score("daqiqa-qochgan.json").score).toBeLessThan(score("yaxshi.json").score);
  });
});

describe("rus tili aralashgan namuna", () => {
  it("lang:cyrillic belgilanadi", () => {
    expect(codes("rus-aralashgan.json")).toContain("lang:cyrillic");
  });

  it("til balli pasayadi", () => {
    expect(score("rus-aralashgan.json").parts.language).toBeLessThan(1);
  });
});

describe("javob kaliti yo'q namuna", () => {
  it("missing_block:answerKey belgilanadi", () => {
    expect(codes("javob-kaliti-yoq.json")).toContain("missing_block:answerKey");
  });

  it("savol umuman bo'lmasa javob kaliti TALAB QILINMAYDI", () => {
    // "yaxshi" namunada savol yo'q — kalit ham kerak emas.
    expect(codes("yaxshi.json")).not.toContain("missing_block:answerKey");
  });
});

describe("markdown aralashgan namuna", () => {
  it("md:bold va md:heading belgilanadi", () => {
    const found = codes("markdown-aralashgan.json");
    expect(found).toContain("md:bold");
    expect(found).toContain("md:heading");
  });
});

describe("kalit so'z qamrovi — o'zbek agglutinatsiyasi", () => {
  it("qo'shimchali so'zlar TO'LIQ qamrov beradi", () => {
    // Namunada "tezlanishni", "harakatlarni", "tezliklarni", "formulaga" —
    // hech biri kalit so'zning aynan o'zi emas. Aynan solishtirishda
    // qamrov 0 bo'lardi.
    const report = score("qoshimchali.json");
    expect(report.parts.coverage).toBe(1);
    expect(report.notes.map((n) => n.code)).not.toContain("coverage:missing");
  });

  it("umuman boshqa atama topilmasa qamrov pasayadi", () => {
    const report = score("yaxshi.json", ["fotosintez", "xlorofill"]);
    expect(report.parts.coverage).toBe(0);
    expect(report.notes.map((n) => n.code)).toContain("coverage:missing");
  });

  it("kurikulumda atama bo'lmasa jarima yo'q", () => {
    expect(score("yaxshi.json", []).parts.coverage).toBe(1);
  });

  it("apostrof varianti qamrovni buzmaydi", () => {
    // "o'lchash" (ASCII apostrof) va "oʻlchash" (U+02BB) bir so'z.
    const report = score("qoshimchali.json", ["oʻlchash"]);
    expect(report.parts.coverage).toBe(1);
  });

  it("stopword qamrovni soxta ko'tarmaydi", () => {
    // "uchun" har matnda bor; u hisobga kirsa qamrov doim yuqori bo'lardi.
    const report = score("yaxshi.json", ["uchun", "fotosintez"]);
    expect(report.parts.coverage).toBe(0);
  });
});

describe("chegaralar", () => {
  it("bo'sh hujjat FAILED chegarasidan past", () => {
    const report = scoreDocument({
      content: { v: 1, blocks: [] },
      durationMinutes: DURATION,
      curriculumTerms: TERMS,
    });
    expect(report.score).toBeLessThan(SCORE_FAIL);
  });

  it("ball uch xonagacha yaxlitlanadi", () => {
    // `Float` ustuniga 0.7000000000000001 tushmasligi kerak.
    const value = score("daqiqa-qochgan.json").score;
    expect(Math.round(value * 1000)).toBe(value * 1000);
  });

  it("izohlarda barqaror kod bor, faqat erkin matn emas", () => {
    for (const note of score("daqiqa-qochgan.json").notes) {
      expect(note.code).toMatch(/^[a-z_]+(:[A-Za-z_]+)?$/);
      expect(["error", "warn"]).toContain(note.severity);
    }
  });
});
