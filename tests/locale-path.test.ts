import { describe, expect, it } from "vitest";
import { localePath, splitLocale } from "@/lib/i18n/locale-path";
import { routing } from "@/lib/i18n/routing";

/** proxy.ts locale'ni aynan shu funksiyalar orqali oladi va qaytaradi. */

describe("splitLocale", () => {
  it.each([
    ["/uz", "uz", "/"],
    ["/uz/", "uz", "/"],
    ["/ru", "ru", "/"],
    ["/uz-Cyrl", "uz-Cyrl", "/"],
    ["/uz/kirish", "uz", "/kirish"],
    ["/ru/onboarding/fanlar", "ru", "/onboarding/fanlar"],
    ["/uz-Cyrl/ish/abc", "uz-Cyrl", "/ish/abc"],
  ])("%s → %s + %s", (pathname, locale, rest) => {
    expect(splitLocale(pathname)).toEqual({ locale, rest });
  });

  it.each([
    ["/", "/"],
    ["/kirish", "/kirish"],
    ["/xx/ish", "/xx/ish"],
    ["/uzbek/ish", "/uzbek/ish"],
  ])("%s — locale yo'q, standart tilga tushadi", (pathname, rest) => {
    expect(splitLocale(pathname)).toEqual({ locale: routing.defaultLocale, rest });
  });

  it("registrga sezgir: /UZ locale emas", () => {
    expect(splitLocale("/UZ/ish").locale).toBe(routing.defaultLocale);
  });

  it("barcha qo'llab-quvvatlanadigan tillar tanib olinadi", () => {
    for (const locale of routing.locales) {
      expect(splitLocale(`/${locale}/ish`)).toEqual({ locale, rest: "/ish" });
    }
  });
});

describe("localePath", () => {
  it.each([
    ["uz", "/ish", "/uz/ish"],
    ["ru", "/kirish", "/ru/kirish"],
    ["uz-Cyrl", "/onboarding", "/uz-Cyrl/onboarding"],
    ["uz", "/", "/uz"],
  ] as const)("(%s, %s) → %s", (locale, path, expected) => {
    expect(localePath(locale, path)).toBe(expected);
  });

  it("splitLocale bilan round-trip qiladi", () => {
    for (const locale of routing.locales) {
      for (const path of ["/", "/kirish", "/ish/abc"]) {
        expect(splitLocale(localePath(locale, path))).toEqual({ locale, rest: path });
      }
    }
  });
});
