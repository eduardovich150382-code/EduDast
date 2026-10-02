import { describe, expect, it } from "vitest";
import {
  listQuery,
  listSkip,
  MAX_PAGE,
  MAX_QUERY_LENGTH,
  parseListParams,
  PER_PAGE,
  statusParamFor,
  STATUS_PARAM,
  type ListParams,
} from "@/lib/documents/list-params";

const EMPTY: ListParams = { page: 1, type: null, status: null, query: "" };

describe("parseListParams", () => {
  it("bo'sh searchParams -> birinchi sahifa, filtrsiz", () => {
    expect(parseListParams({})).toEqual(EMPTY);
  });

  it("to'liq filtrni o'qiydi", () => {
    expect(
      parseListParams({ sahifa: "3", tur: "test", holat: "tayyor", q: "harakat" }),
    ).toEqual({ page: 3, type: "TEST", status: "DONE", query: "harakat" });
  });

  it.each([
    ["nol", "0"],
    ["manfiy", "-1"],
    ["matn", "abc"],
    ["kasr", "2.5"],
    ["eksponensial", "1e9"],
    ["bo'sh", ""],
    ["shiftdan oshgan", String(MAX_PAGE + 1)],
  ] as const)("noto'g'ri sahifa (%s) -> 1", (_label, value) => {
    expect(parseListParams({ sahifa: value }).page).toBe(1);
  });

  it("shift chegarasining o'zi qabul qilinadi", () => {
    expect(parseListParams({ sahifa: String(MAX_PAGE) }).page).toBe(MAX_PAGE);
  });

  it.each([
    ["noma'lum tur", { tur: "taqdimot" }, "type"],
    ["noma'lum holat", { holat: "qandaydir" }, "status"],
    ["enum nomining o'zi tur sifatida", { tur: "LESSON_PLAN" }, "type"],
    ["enum nomining o'zi holat sifatida", { holat: "DONE" }, "status"],
  ] as const)("%s -> null (filtr qo'llanmaydi)", (_label, raw, field) => {
    // Enum nomi URL'da ATAYLAB ishlamaydi: tashqi yuzada faqat o'zbekcha
    // taxalluslar bor, shunda baza enum qiymatini qayta nomlash ulashilgan
    // havolani buzmaydi.
    expect(parseListParams(raw)[field]).toBeNull();
  });

  it("qidiruv matni trim qilinadi va cheklanadi", () => {
    expect(parseListParams({ q: "  test  " }).query).toBe("test");
    expect(parseListParams({ q: "a".repeat(500) }).query).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });

  it("barcha holat taxalluslari o'qiladi", () => {
    for (const [param, status] of Object.entries(STATUS_PARAM)) {
      expect(parseListParams({ holat: param }).status).toBe(status);
    }
  });

  it("statusParamFor teskari yo'nalishda mos", () => {
    for (const [param, status] of Object.entries(STATUS_PARAM)) {
      expect(statusParamFor(status)).toBe(param);
    }
  });
});

describe("listSkip", () => {
  it("birinchi sahifada 0", () => {
    expect(listSkip(EMPTY)).toBe(0);
  });

  it("keyingi sahifalar PER_PAGE bo'yicha", () => {
    expect(listSkip({ ...EMPTY, page: 2 })).toBe(PER_PAGE);
    expect(listSkip({ ...EMPTY, page: 4 })).toBe(PER_PAGE * 3);
  });
});

describe("listQuery", () => {
  it("bo'sh holat bo'sh query beradi", () => {
    expect(listQuery(EMPTY)).toEqual({});
  });

  it("birinchi sahifa URL'ga yozilmaydi", () => {
    expect(listQuery({ ...EMPTY, page: 1 }).sahifa).toBeUndefined();
    expect(listQuery({ ...EMPTY, page: 2 }).sahifa).toBe("2");
  });

  it("filtrlar taxallus sifatida yoziladi", () => {
    expect(listQuery({ page: 1, type: "TEST", status: "FAILED", query: "x" })).toEqual(
      { tur: "test", holat: "yiqildi", q: "x" },
    );
  });

  it("FILTR O'ZGARSA SAHIFA 1 GA QAYTADI", () => {
    // Klassik xato: o'qituvchi 4-sahifada turib "faqat testlar" ni bosadi,
    // testlar esa 2 ta — bo'sh ekran chiqib, filtr buzuq ko'rinadi.
    const onPageFour: ListParams = { ...EMPTY, page: 4 };
    expect(listQuery(onPageFour, { tur: "test" }).sahifa).toBeUndefined();
    expect(listQuery(onPageFour, { holat: "tayyor" }).sahifa).toBeUndefined();
    expect(listQuery(onPageFour, { q: "yangi" }).sahifa).toBeUndefined();
  });

  it("filtrni TOZALASH ham sahifani qaytaradi", () => {
    const filtered: ListParams = { ...EMPTY, page: 4, type: "TEST" };
    const query = listQuery(filtered, { tur: null });
    expect(query.sahifa).toBeUndefined();
    expect(query.tur).toBeUndefined();
  });

  it("pager havolasi sahifani ANIQ bergani uchun qoida ishlamaydi", () => {
    const filtered: ListParams = { ...EMPTY, page: 2, type: "TEST" };
    expect(listQuery(filtered, { sahifa: 3 })).toEqual({
      sahifa: "3",
      tur: "test",
    });
  });

  it("filtr va sahifa birga berilsa sahifa saqlanadi", () => {
    const filtered: ListParams = { ...EMPTY, page: 4 };
    expect(listQuery(filtered, { tur: "dars", sahifa: 2 }).sahifa).toBe("2");
  });

  it("filtr o'zgarmasa joriy sahifa saqlanadi", () => {
    const filtered: ListParams = { ...EMPTY, page: 3, type: "TEST" };
    expect(listQuery(filtered)).toEqual({ sahifa: "3", tur: "test" });
  });

  it("round-trip: parseListParams(listQuery(p)) === p", () => {
    const original = parseListParams({
      sahifa: "5",
      tur: "dars",
      holat: "tayyorlanmoqda",
      q: "issiqlik",
    });
    expect(parseListParams(listQuery(original))).toEqual(original);
  });
});
