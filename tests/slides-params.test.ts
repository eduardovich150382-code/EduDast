import { describe, expect, it } from "vitest";
import {
  NOTES_PARAM,
  playerQuery,
  PRESENTER_PARAM,
  PRESENTER_VALUE,
  readPlayerView,
} from "@/lib/slides/player-params";

/**
 * Pleyer ko'rinishi URL'da yashaydi, ya'ni uni o'qituvchi qo'lda
 * tahrirlashi yoki eski havola yuborishi mumkin. Asosiy da'vo sehrgar
 * testlari bilan bir xil: har qanday kirishda throw QILMAYDI va hamisha
 * ishlatishga yaroqli holat qaytaradi — dars o'rtasida xato ekrani yo'q.
 */

describe("readPlayerView — default", () => {
  it("bo'sh URL: oddiy pleyer, izoh YOPIQ", () => {
    // Izoh ekranga chiqadi, sinf uni ko'rardi — shuning uchun default yopiq.
    expect(readPlayerView({})).toEqual({ presenter: false, notes: false });
  });

  it("?rejim=notiq: notiq ko'rinishi, izoh OCHIQ", () => {
    // Izoh notiq ko'rinishining butun maqsadi, shuning uchun u yerda default ochiq.
    expect(readPlayerView({ [PRESENTER_PARAM]: PRESENTER_VALUE })).toEqual({
      presenter: true,
      notes: true,
    });
  });
});

describe("readPlayerView — izoh aniq berilganda", () => {
  it.each([
    ["bor", true],
    ["yoq", false],
  ] as const)("?izoh=%s -> %s", (value, expected) => {
    expect(readPlayerView({ [NOTES_PARAM]: value }).notes).toBe(expected);
  });

  it("aniq qiymat REJIM default'ini bosib ketadi", () => {
    // Notiq ko'rinishida izohni yopish mumkin (masalan ekranni ulashganda).
    expect(
      readPlayerView({ [PRESENTER_PARAM]: PRESENTER_VALUE, [NOTES_PARAM]: "yoq" }),
    ).toEqual({ presenter: true, notes: false });
    // Oddiy pleyerda izohni ochish ham mumkin (chop etish uchun).
    expect(readPlayerView({ [NOTES_PARAM]: "bor" })).toEqual({
      presenter: false,
      notes: true,
    });
  });
});

describe("readPlayerView — buzuq kirish", () => {
  it.each([
    ["noma'lum rejim", { [PRESENTER_PARAM]: "presenter" }],
    ["bo'sh rejim", { [PRESENTER_PARAM]: "" }],
    ["inglizcha qiymat", { [PRESENTER_PARAM]: "speaker" }],
  ])("%s -> oddiy pleyer", (_label, raw) => {
    expect(readPlayerView(raw).presenter).toBe(false);
  });

  it.each([
    ["noma'lum izoh qiymati", { [NOTES_PARAM]: "ha" }],
    ["inglizcha", { [NOTES_PARAM]: "yes" }],
    ["bo'sh", { [NOTES_PARAM]: "" }],
    ["son", { [NOTES_PARAM]: "1" }],
  ])("%s -> rejim default'iga tushadi", (_label, raw) => {
    expect(readPlayerView(raw).notes).toBe(false);
  });

  it("prototip kalitlari qiymat sifatida qabul qilinmaydi", () => {
    // `notesRaw in NOTES_VALUES` tekshiruvi `"toString"` kabi meros
    // kalitlarni ham topishi mumkin edi — `as const` obyekt literalida
    // ular yo'q, lekin bu kafolatni qadab qo'yish arzon.
    expect(readPlayerView({ [NOTES_PARAM]: "toString" }).notes).toBe(false);
    expect(readPlayerView({ [NOTES_PARAM]: "constructor" }).notes).toBe(false);
  });

  it("takrorlangan parametrdan birinchisi olinadi", () => {
    expect(
      readPlayerView({ [PRESENTER_PARAM]: [PRESENTER_VALUE, "boshqa"] }).presenter,
    ).toBe(true);
  });

  it("boshqa parametrlar e'tiborsiz qoldiriladi", () => {
    expect(readPlayerView({ tur: "dars", slayd: "12", q: "harakat" })).toEqual({
      presenter: false,
      notes: false,
    });
  });
});

describe("playerQuery", () => {
  it("default holat rejim kalitini YOZMAYDI", () => {
    // Toza havola: `?rejim=` ko'rinib qolishi ulashilgan URL'ni xunuk qiladi.
    expect(playerQuery({ presenter: false, notes: false })).toEqual({ izoh: "yoq" });
  });

  it("izoh HAR DOIM yoziladi", () => {
    // Chop etish uchun ulashilgan havolada "izohsiz" holati ANIQ bo'lishi
    // kerak, aks holda qabul qiluvchining rejimi defaultni boshqacha hal
    // qilardi va chop etilgan nusxa boshqa chiqardi.
    expect(playerQuery({ presenter: true, notes: true })).toEqual({
      rejim: "notiq",
      izoh: "bor",
    });
  });

  it("round-trip: qurilgan query qaytib o'qiladi", () => {
    for (const presenter of [true, false]) {
      for (const notes of [true, false]) {
        const view = { presenter, notes };
        expect(readPlayerView(playerQuery(view)), JSON.stringify(view)).toEqual(view);
      }
    }
  });

  it("overrides bilan izohni teskari qiladi", () => {
    const view = { presenter: false, notes: false };
    expect(playerQuery(view, { izoh: "bor" })).toEqual({ izoh: "bor" });
  });

  it("overrides null bilan rejimdan chiqadi", () => {
    const view = { presenter: true, notes: true };
    expect(playerQuery(view, { rejim: null })).toEqual({ izoh: "bor" });
  });
});
