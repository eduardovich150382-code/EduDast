import { describe, expect, it } from "vitest";
import { looksLikeCommand, parseBotCommand } from "@/lib/telegram/commands";
import { parseStartCommand } from "@/lib/auth/telegram-login";
import { anchorDayFor } from "@/lib/reminders/plan";
import { schoolDay } from "@/lib/calendar/placement";

/**
 * Bot buyruqlarining SOF mantig'i. Webhook'dagi `handleCommand` IO bilan
 * aralashgan (Prisma + next-intl + Telegram), shuning uchun TANIB OLISH
 * qismi alohida modulda va aynan shu yerda jadval ko'rinishida
 * tekshiriladi.
 */

describe("parseBotCommand", () => {
  it.each([
    ["/bugun", "bugun"],
    ["/hafta", "hafta"],
    ["/eslatma", "eslatma"],
  ])("%s -> %s", (text, expected) => {
    expect(parseBotCommand(text)).toBe(expected);
  });

  /** Telegram guruhda buyruqqa bot nomini qo'shib yuboradi. */
  it.each([
    ["/bugun@EduDastBot", "bugun"],
    ["/hafta@EduDastBot", "hafta"],
    ["/eslatma@edudastbot", "eslatma"],
  ])("guruh shakli %s -> %s", (text, expected) => {
    expect(parseBotCommand(text)).toBe(expected);
  });

  it.each(["/BUGUN", "/Hafta", "/ESLATMA@EduDastBot"])("katta harf ham tanildi: %s", (text) => {
    expect(parseBotCommand(text)).not.toBeNull();
  });

  it("atrofdagi bo'sh joy va argumentlar e'tiborga olinmaydi", () => {
    expect(parseBotCommand("   /bugun   ")).toBe("bugun");
    expect(parseBotCommand("/hafta keyingi")).toBe("hafta");
  });

  it.each([
    ["bo'sh matn", ""],
    ["undefined", undefined],
    ["slash yo'q", "bugun"],
    ["noma'lum buyruq", "/oylik"],
    ["prefiks o'xshash", "/bugunlik"],
    ["faqat slash", "/"],
    ["oddiy gap", "Salom, qanday ishlaydi?"],
  ])("%s -> null", (_nom, text) => {
    expect(parseBotCommand(text)).toBeNull();
  });

  /** ESKI YO'L BUZILMASIN: `/start` bu parserga tegishli emas. */
  it("/start -> null (uni parseStartCommand ishlaydi)", () => {
    expect(parseBotCommand("/start")).toBeNull();
    expect(parseBotCommand("/start abc12345")).toBeNull();
    // Teskarisi ham: yangi buyruqlar `/start` parseriga tushmaydi.
    expect(parseStartCommand("/bugun")).toBeNull();
    expect(parseStartCommand("/hafta")).toBeNull();
  });
});

describe("looksLikeCommand", () => {
  it("buyruqqa o'xshash matnni ajratadi", () => {
    expect(looksLikeCommand("/xyz")).toBe(true);
    expect(looksLikeCommand("  /xyz")).toBe(true);
  });

  /**
   * Oddiy matnga "buyruqni bilmayman" deb javob berish o'qituvchini
   * bezovta qilardi — u botga shunchaki yozishi mumkin.
   */
  it("oddiy matn buyruq EMAS", () => {
    expect(looksLikeCommand("Salom")).toBe(false);
    expect(looksLikeCommand("")).toBe(false);
    expect(looksLikeCommand(undefined)).toBe(false);
  });
});

/**
 * `/hafta` ning anchori — yakshanba tuzog'i.
 *
 * Webhook `command === "hafta"` bo'lganda `anchorDayFor(now)`, aks holda
 * `schoolDay(now)` ishlatadi. Bu yerda o'sha ikki qiymatning FARQI
 * tekshiriladi: yakshanbada ular boshqa-boshqa haftaga tushishi kerak,
 * aks holda `/hafta` o'tgan haftani ko'rsatib qo'yardi.
 */
describe("/hafta anchori", () => {
  const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("YAKSHANBA: anchor keyingi dushanba, `schoolDay` esa o'sha yakshanba", () => {
    // 2026-10-11 yakshanba, 15:00 UTC = 20:00 Toshkent.
    const now = new Date("2026-10-11T15:00:00.000Z");

    expect(anchorDayFor(now).toISOString()).toBe(utc("2026-10-12").toISOString());
    expect(schoolDay(now).toISOString()).toBe(utc("2026-10-11").toISOString());
    // Ikkisi BOSHQA ISO haftada — aynan shu farq tuzoqni yopadi.
    expect(anchorDayFor(now).getTime()).not.toBe(schoolDay(now).getTime());
  });

  it("CHORSHANBA: anchor payshanba, ikkisi ham o'sha haftada", () => {
    // 2026-10-07 chorshanba, 15:00 UTC = 20:00 Toshkent.
    const now = new Date("2026-10-07T15:00:00.000Z");

    expect(anchorDayFor(now).toISOString()).toBe(utc("2026-10-08").toISOString());
    expect(schoolDay(now).toISOString()).toBe(utc("2026-10-07").toISOString());
  });

  it("SHANBA: ertaga yakshanba — hali SHU haftada (ISO 7)", () => {
    // 2026-10-10 shanba.
    const now = new Date("2026-10-10T15:00:00.000Z");
    expect(anchorDayFor(now).toISOString()).toBe(utc("2026-10-11").toISOString());
  });
});
