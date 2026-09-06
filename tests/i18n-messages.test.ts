import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md, 1-qoida qorovuli: "Yangi matn qo'shsang — uchala faylga ham
 * kalit qo'sh." Uchala tilning kalit daraxti bir xil bo'lishi shart —
 * aks holda biror tilda tarjima unutilib qolishi mumkin.
 */

const MESSAGES_DIR = join(__dirname, "..", "messages");
const LOCALES = ["uz", "uz-Cyrl", "ru"] as const;

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function loadKeyPaths(locale: string): string[] {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf-8");
  const json = JSON.parse(raw);
  return collectKeyPaths(json).sort();
}

const keysByLocale = new Map(
  LOCALES.map((locale) => [locale, loadKeyPaths(locale)] as const),
);

describe("i18n xabar kalitlari", () => {
  it.each(LOCALES)("%s bo'sh emas", (locale) => {
    expect(keysByLocale.get(locale)!.length).toBeGreaterThan(0);
  });

  const baseLocale = LOCALES[0];
  const baseKeys = keysByLocale.get(baseLocale)!;

  it.each(LOCALES.slice(1))(
    `%s kalit daraxti "${baseLocale}" bilan bir xil`,
    (locale) => {
      expect(keysByLocale.get(locale)).toEqual(baseKeys);
    },
  );
});
