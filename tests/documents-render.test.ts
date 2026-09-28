import { describe, expect, it } from "vitest";
import type { Block, DocumentContent } from "@/lib/documents/blocks";
import { renderBlock, renderDocument } from "@/lib/documents/render";

/**
 * `render.ts` — sifat bahosi, eksport va qidiruvning umumiy manbai.
 *
 * Ikki xossa tekshiriladi:
 *   1. DETERMINISTIK — bir xil bloklar bir xil satr (kesh va sifat balli
 *      shunga tayanadi);
 *   2. MARKDOWN CHIQARMAYDI — aks holda `quality.ts` dagi markdown
 *      detektori o'z chiqishimizni jarima qilardi.
 */

const STAGES: Block = {
  id: "s2-stages-0",
  type: "stages",
  items: [
    {
      title: "Kirish",
      minutes: 7,
      teacherActions: ["Hayotiy misol keltiradi"],
      studentActions: ["Taxmin aytadi"],
    },
  ],
};

const CONTENT: DocumentContent = {
  v: 1,
  blocks: [
    { id: "s1-heading-0", type: "heading", level: 1, text: "Tezlanish" },
    { id: "s1-objectives-0", type: "objectives", items: ["Tezlanishni hisoblaydi"] },
    STAGES,
    { id: "s3-homework-0", type: "homework", items: ["12-mashq"], estimatedMinutes: 15 },
  ],
};

describe("renderDocument", () => {
  it("deterministik — ikki chaqiruv bir xil satr", () => {
    expect(renderDocument(CONTENT)).toBe(renderDocument(CONTENT));
  });

  it("markdown belgilarini chiqarmaydi", () => {
    const text = renderDocument(CONTENT);
    expect(text).not.toMatch(/\*\*/);
    expect(text).not.toMatch(/^#{1,6}\s/m);
    // Ro'yxat belgisi markdown `- ` EMAS: aks holda `quality.ts` dagi
    // `md:bullet` detektori har hujjatni jarima qilardi.
    expect(text).not.toMatch(/^\s*-\s/m);
    expect(text).not.toMatch(/```/);
  });

  it("blok mazmuni matnga tushadi", () => {
    const text = renderDocument(CONTENT);
    expect(text).toContain("Tezlanish");
    expect(text).toContain("Tezlanishni hisoblaydi");
    expect(text).toContain("Hayotiy misol keltiradi");
    expect(text).toContain("12-mashq");
  });

  it("bo'sh kontent bo'sh satr beradi", () => {
    expect(renderDocument({ v: 1, blocks: [] })).toBe("");
  });

  it("bloklar bo'sh qator bilan ajratiladi", () => {
    const content: DocumentContent = {
      v: 1,
      blocks: [
        { id: "a", type: "paragraph", text: "Bir" },
        { id: "b", type: "paragraph", text: "Ikki" },
      ],
    };
    expect(renderDocument(content)).toBe("Bir\n\nIkki");
  });
});

describe("renderBlock", () => {
  it("raqamli ro'yxat raqam bilan chiqadi", () => {
    const block: Block = { id: "l", type: "list", style: "ordered", items: ["bir", "ikki"] };
    expect(renderBlock(block)).toBe("1. bir\n2. ikki");
  });

  it("bosqichda daqiqa va ikkala tomon harakati bor", () => {
    const text = renderBlock(STAGES);
    expect(text).toContain("Kirish (7 daqiqa)");
    expect(text).toContain("O'qituvchi: Hayotiy misol keltiradi");
    expect(text).toContain("O'quvchi: Taxmin aytadi");
  });

  it("jadval tabulyatsiya bilan — ustun kengligi hisoblanmaydi", () => {
    // Kenglik hisoblansa bitta katak uzayishi butun jadvalni qayta
    // tekislab, "o'zgarmagan" matnni o'zgartirardi.
    const block: Block = {
      id: "t",
      type: "table",
      headers: ["A", "B"],
      rows: [["1", "2"]],
    };
    expect(renderBlock(block)).toBe("A\tB\n1\t2");
  });

  it("uy vazifasi vaqti ko'rsatilgan bo'lsa qo'shiladi", () => {
    const block: Block = {
      id: "h",
      type: "homework",
      items: ["Mashq"],
      estimatedMinutes: 15,
    };
    expect(renderBlock(block)).toContain("Taxminiy vaqt: 15 daqiqa");
  });

  it("sonlar locale'ga bog'liq formatlanmaydi", () => {
    const block: Block = {
      id: "r",
      type: "rubric",
      criteria: [{ name: "Faollik", maxPoints: 1000, descriptors: ["Ha"] }],
    };
    // `toLocaleString` bo'lsa "1 000" yoki "1,000" chiqardi.
    expect(renderBlock(block)).toContain("(1000 ball)");
  });
});
