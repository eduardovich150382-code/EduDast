import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  checkColumns,
  parseCurriculumRows,
  splitList,
  type RawCsvRecord,
} from "@/lib/curriculum/csv-schema";

/**
 * lib/curriculum/csv-schema.ts — sof validatsiya (bazasiz).
 * Format hujjati: docs/curriculum-csv.md
 */

/** To'g'ri qator; testlar undan kerakli maydonni buzib ishlatadi. */
function record(overrides: Partial<Record<string, string>> = {}): RawCsvRecord {
  return {
    grade: "7",
    parent_slug: "",
    slug: "mexanik-harakat",
    title_uz: "Mexanik harakat",
    title_uz_cyrl: "Механик ҳаракат",
    title_ru: "Механическое движение",
    order: "1",
    objectives: "",
    keywords: "",
    hours_plan: "",
    ...overrides,
  };
}

function errorsOf(records: RawCsvRecord[]): string[] {
  const result = parseCurriculumRows(records);
  return result.ok ? [] : result.errors;
}

describe("splitList", () => {
  it("'|' bo'yicha ajratadi va bo'sh elementlarni tashlaydi", () => {
    expect(splitList("a|b||  c  ")).toEqual(["a", "b", "c"]);
  });

  it("bo'sh va undefined — bo'sh massiv", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
  });
});

describe("checkColumns", () => {
  it("hamma ustun bor — xato yo'q", () => {
    expect(checkColumns([...CSV_COLUMNS])).toEqual([]);
  });

  it("bo'shliq bilan yozilgan sarlavha ham qabul qilinadi", () => {
    expect(checkColumns(CSV_COLUMNS.map((column) => ` ${column} `))).toEqual([]);
  });

  it("yetishmayotgan ustunlarni bitta xatoda sanaydi", () => {
    const errors = checkColumns(["grade", "slug"]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("title_uz");
    expect(errors[0]).toContain("hours_plan");
  });
});

describe("parseCurriculumRows — to'g'ri qatorlar", () => {
  it("normallashtirilgan qator qaytaradi", () => {
    const result = parseCurriculumRows([
      record({
        grade: " 7 ",
        title_uz: "  Mexanik harakat  ",
        objectives: "Birinchi|  Ikkinchi  |",
        keywords: "harakat|tezlik",
        hours_plan: "2",
      }),
    ]);

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          grade: 7,
          parentSlug: null,
          slug: "mexanik-harakat",
          titleUz: "Mexanik harakat",
          titleUzCyrl: "Механик ҳаракат",
          titleRu: "Механическое движение",
          order: 1,
          objectives: ["Birinchi", "Ikkinchi"],
          keywords: ["harakat", "tezlik"],
          hoursPlan: 2,
        },
      ],
    });
  });

  it("bo'sh parent_slug — ildiz tugun (null)", () => {
    const result = parseCurriculumRows([record({ parent_slug: "  " })]);

    expect(result.ok && result.rows[0]?.parentSlug).toBe(null);
  });

  it("bo'sh hours_plan — null", () => {
    const result = parseCurriculumRows([record({ hours_plan: "" })]);

    expect(result.ok && result.rows[0]?.hoursPlan).toBe(null);
  });

  it("order 0 bo'lishi mumkin", () => {
    expect(parseCurriculumRows([record({ order: "0" })]).ok).toBe(true);
  });
});

describe("parseCurriculumRows — maydon xatolari", () => {
  it("xato xabarida qator raqami, ustun nomi va topilgan qiymat bo'ladi", () => {
    const errors = errorsOf([record({ grade: "0" })]);

    expect(errors).toEqual(['2-qator, "grade" ustuni: 1 dan 11 gacha bo\'lishi kerak (topildi: "0")']);
  });

  it("qator raqami sarlavhani hisobga oladi (birinchi ma'lumot — 2-qator)", () => {
    const errors = errorsOf([record(), record({ grade: "12" })]);

    expect(errors[0]).toMatch(/^3-qator/);
  });

  it("birinchi xatoda to'xtamaydi — hammasini yig'adi", () => {
    const errors = errorsOf([record({ grade: "x" }), record({ slug: "Katta_Slug" })]);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"grade"');
    expect(errors[1]).toContain('"slug"');
  });

  it.each([
    ["grade son emas", { grade: "yetti" }],
    ["grade 0", { grade: "0" }],
    ["grade 12", { grade: "12" }],
    ["slug bo'sh", { slug: "" }],
    ["slug katta harf", { slug: "Mexanik" }],
    ["slug pastki chiziq", { slug: "mexanik_harakat" }],
    ["slug ikki chiziqcha", { slug: "mexanik--harakat" }],
    ["parent_slug shakli buzuq", { parent_slug: "Bo'lim 1" }],
    ["title_uz bo'sh", { title_uz: "   " }],
    ["title_uz_cyrl bo'sh", { title_uz_cyrl: "" }],
    ["title_ru bo'sh", { title_ru: "" }],
    ["order son emas", { order: "x" }],
    ["order manfiy", { order: "-1" }],
    ["hours_plan son emas", { hours_plan: "ikki" }],
    ["hours_plan 0", { hours_plan: "0" }],
  ])("rad etadi: %s", (_nom, overrides) => {
    expect(errorsOf([record(overrides)])).not.toHaveLength(0);
  });

  it("ustun butunlay yo'q bo'lsa 'ustun yo'q' deb yozadi", () => {
    const broken = record();
    delete broken.title_uz;

    const errors = errorsOf([broken]);

    expect(errors[0]).toContain('"title_uz"');
    expect(errors[0]).toContain("ustun yo'q");
  });
});

describe("parseCurriculumRows — daraxt tuzilishi", () => {
  it("bir xil (grade, slug) juftligi rad etiladi", () => {
    const errors = errorsOf([record(), record({ order: "2" })]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("2-qatorda allaqachon bor");
  });

  it("boshqa sinfdagi bir xil slug — xato emas", () => {
    expect(parseCurriculumRows([record(), record({ grade: "8" })]).ok).toBe(true);
  });

  it("o'ziga ota bo'lish rad etiladi", () => {
    const errors = errorsOf([record({ parent_slug: "mexanik-harakat" })]);

    expect(errors[0]).toContain("o'ziga ota bo'la olmaydi");
  });

  it("ota-bola sikli rad etiladi", () => {
    const errors = errorsOf([
      record({ slug: "a", parent_slug: "b" }),
      record({ slug: "b", parent_slug: "a" }),
    ]);

    expect(errors.some((error) => error.includes("sikli"))).toBe(true);
  });

  it("uch bo'g'inli sikl ham topiladi", () => {
    const errors = errorsOf([
      record({ slug: "a", parent_slug: "c" }),
      record({ slug: "b", parent_slug: "a" }),
      record({ slug: "c", parent_slug: "b" }),
    ]);

    expect(errors.some((error) => error.includes("sikli"))).toBe(true);
  });

  it("ota faylda pastroqda tursa ham qabul qilinadi", () => {
    const result = parseCurriculumRows([
      record({ slug: "bola", parent_slug: "bolim" }),
      record({ slug: "bolim", parent_slug: "" }),
    ]);

    expect(result.ok).toBe(true);
  });

  it("ota faylda umuman bo'lmasligi xato emas (bazada bo'lishi mumkin)", () => {
    const result = parseCurriculumRows([record({ parent_slug: "bazadagi-bolim" })]);

    expect(result.ok).toBe(true);
  });
});
