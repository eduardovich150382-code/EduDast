import { describe, expect, it } from "vitest";
import {
  Block,
  BLOCK_TYPES,
  blockId,
  DocumentContent,
  EMPTY_CONTENT,
} from "@/lib/documents/blocks";

/**
 * Kontent shartnomasi — bazaga faqat tekshirilgan ma'lumot tushishi kerak.
 *
 * Bu sxema `Document.contentJson` da YILLAB yashaydi, shuning uchun
 * bo'shashtirish oson, qattiqlashtirish qiyin: bugun o'tib ketgan buzuq
 * blok ertaga eksportni yiqitadi.
 */

const HEADING = { id: "s1-heading-0", type: "heading", level: 1, text: "Tezlanish" } as const;

function mcq(overrides: Record<string, unknown> = {}) {
  return {
    id: "s3-question-0",
    type: "question",
    kind: "mcq",
    text: "Tezlanish birligi qaysi?",
    options: ["m/s", "m/s^2", "N"],
    answer: "m/s^2",
    points: 1,
    bloom: "remember",
    ...overrides,
  };
}

describe("blok sxemasi", () => {
  it("BLOCK_TYPES union bilan to'liq mos", () => {
    // `satisfies` tipda tekshiradi, bu esa RO'YXAT to'liqligini: union'ga
    // blok qo'shilib ro'yxat unutilsa, bu yerda son farq qiladi.
    expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
    expect(BLOCK_TYPES.length).toBe(12);
  });

  it("har blok turi round-trip dan o'tadi", () => {
    const blocks: unknown[] = [
      HEADING,
      { id: "b2", type: "paragraph", text: "Matn." },
      { id: "b3", type: "list", style: "bullet", items: ["bir", "ikki"] },
      {
        id: "b4",
        type: "table",
        headers: ["Vaqt", "Tezlik"],
        rows: [
          ["0", "0"],
          ["1", "10"],
        ],
      },
      { id: "b5", type: "objectives", items: ["Tezlanishni hisoblaydi"] },
      { id: "b6", type: "materials", items: ["Doska"] },
      {
        id: "b7",
        type: "stages",
        items: [
          { title: "Kirish", minutes: 5, teacherActions: ["Savol beradi"], studentActions: ["Javob beradi"] },
          { title: "Yakun", minutes: 5, teacherActions: ["Xulosa"], studentActions: ["Yozadi"] },
        ],
      },
      mcq(),
      { id: "b9", type: "answerKey", items: [{ questionId: "s3-question-0", answer: "m/s^2" }] },
      {
        id: "b10",
        type: "rubric",
        criteria: [{ name: "Faollik", maxPoints: 5, descriptors: ["Ikki marta javob berdi"] }],
      },
      { id: "b11", type: "homework", items: ["12-mashqni yeching"], estimatedMinutes: 20 },
      { id: "b12", type: "note", tone: "tip", text: "Kuchsiz o'quvchiga yordam bering." },
    ];

    for (const block of blocks) {
      const parsed = Block.safeParse(block);
      expect(parsed.success, JSON.stringify(block)).toBe(true);
    }

    const content = { v: 1, blocks };
    expect(DocumentContent.parse(content).blocks.length).toBe(12);
  });

  it("noma'lum blok turi rad etiladi", () => {
    expect(Block.safeParse({ id: "x", type: "video", url: "..." }).success).toBe(false);
  });

  it("noma'lum kalit rad etiladi (strictObject)", () => {
    expect(Block.safeParse({ ...HEADING, extra: 1 }).success).toBe(false);
  });

  it.each([
    ["bo'sh matn", { ...HEADING, text: "" }],
    ["noto'g'ri daraja", { ...HEADING, level: 7 }],
    ["id yo'q", { type: "heading", level: 1, text: "X" }],
  ])("%s rad etiladi", (_name, block) => {
    expect(Block.safeParse(block).success).toBe(false);
  });
});

describe("jadval", () => {
  it("satr uzunligi sarlavhaga teng bo'lmasa rad etiladi", () => {
    const table = {
      id: "t",
      type: "table",
      headers: ["A", "B"],
      rows: [["1", "2"], ["3"]],
    };
    expect(Block.safeParse(table).success).toBe(false);
  });

  it("bo'sh katak ruxsat etiladi", () => {
    const table = { id: "t", type: "table", headers: ["A", "B"], rows: [["1", ""]] };
    expect(Block.safeParse(table).success).toBe(true);
  });
});

describe("savol qoidalari", () => {
  it("to'g'ri mcq o'tadi", () => {
    expect(Block.safeParse(mcq()).success).toBe(true);
  });

  it("mcq: 3 tadan kam TURLI variant rad etiladi", () => {
    // Uchta element, lekin ikkitasi bir xil — "tanlov" soxta.
    const block = mcq({ options: ["m/s", "m/s", "N"], answer: "N" });
    expect(Block.safeParse(block).success).toBe(false);
  });

  it("mcq: javob variantlar ichida bo'lmasa rad etiladi", () => {
    expect(Block.safeParse(mcq({ answer: "kg" })).success).toBe(false);
  });

  it("truefalse: variant ro'yxati bo'lsa rad etiladi", () => {
    const block = mcq({ kind: "truefalse", options: ["ha", "yo'q"], answer: "ha" });
    expect(Block.safeParse(block).success).toBe(false);
  });

  it("truefalse: variantsiz o'tadi", () => {
    const block = mcq({ kind: "truefalse", options: [], answer: "ha" });
    expect(Block.safeParse(block).success).toBe(true);
  });

  /**
   * `match` juftliklari — 10-sessiya.
   *
   * Juftliklar `pairs` da, `options` dagi ajratgichli satrda EMAS: atamaning
   * o'zida tire uchraydi, ya'ni satrni bo'lish ertami-kechmi noto'g'ri
   * joyda kesardi.
   */
  const PAIRS = [
    { left: "Tezlanish", right: "m/s^2" },
    { left: "Tezlik", right: "m/s" },
  ];

  it("match: pairs bilan o'tadi", () => {
    const block = mcq({ kind: "match", options: [], pairs: PAIRS, answer: "Tezlanish - m/s^2" });
    expect(Block.safeParse(block).success).toBe(true);
  });

  it("match: pairs yo'q bo'lsa rad etiladi", () => {
    const block = mcq({ kind: "match", options: [], answer: "a-1" });
    expect(Block.safeParse(block).success).toBe(false);
  });

  it("match: 2 tadan kam juft rad etiladi", () => {
    const block = mcq({
      kind: "match",
      options: [],
      pairs: [{ left: "Tezlanish", right: "m/s^2" }],
      answer: "a-1",
    });
    expect(Block.safeParse(block).success).toBe(false);
  });

  it("match: variant ro'yxati bo'lsa rad etiladi", () => {
    // Juftliklar ikki joyda saqlanishi — muharrir va eksport uchun tuzoq.
    const block = mcq({ kind: "match", options: ["a", "b"], pairs: PAIRS, answer: "a-1" });
    expect(Block.safeParse(block).success).toBe(false);
  });

  it.each(["mcq", "short", "truefalse"])("%s: pairs berilsa rad etiladi", (kind) => {
    // BO'SH MASSIV HAM "berilgan" hisoblanadi — o'girgich maydonni
    // butunlay tashlab ketishi shart (`plans-test.ts`).
    const base =
      kind === "mcq"
        ? mcq({ pairs: PAIRS })
        : mcq({ kind, options: [], answer: "ha", pairs: PAIRS });
    expect(Block.safeParse(base).success).toBe(false);
  });

  it("pairs: bo'sh massiv ham rad etiladi", () => {
    expect(Block.safeParse(mcq({ pairs: [] })).success).toBe(false);
  });
});

describe("DocumentContent", () => {
  it("bo'sh kontent haqiqiy", () => {
    expect(DocumentContent.parse(EMPTY_CONTENT)).toEqual({ v: 1, blocks: [] });
  });

  it("v mos kelmasa rad etiladi", () => {
    expect(DocumentContent.safeParse({ v: 2, blocks: [] }).success).toBe(false);
  });

  it("v yo'q bo'lsa rad etiladi", () => {
    expect(DocumentContent.safeParse({ blocks: [] }).success).toBe(false);
  });

  it("takrorlangan blok id rad etiladi", () => {
    // Himoyaning ikkinchi qavati: `commitStage` darvozasi yorilib,
    // bir bosqich ikki marta yozilsa shu yerda ushlanadi.
    const content = { v: 1, blocks: [HEADING, { ...HEADING, text: "Boshqa" }] };
    expect(DocumentContent.safeParse(content).success).toBe(false);
  });
});

describe("blockId", () => {
  it("bosqich, tur va indeksdan deterministik", () => {
    expect(blockId("1", "objectives", 0)).toBe("s1-objectives-0");
    expect(blockId("2a", "stages", 0)).toBe("s2a-stages-0");
  });

  it("bir xil kirishda bir xil id — qayta urinish blokni takrorlamaydi", () => {
    expect(blockId("3", "note", 2)).toBe(blockId("3", "note", 2));
  });

  it("bo'lingan bosqichlar to'qnashmaydi", () => {
    expect(blockId("2a", "stages", 0)).not.toBe(blockId("2b", "stages", 0));
  });
});
