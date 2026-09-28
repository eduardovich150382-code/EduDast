import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `tests/i18n-messages.test.ts` uchala tilning kalit DARAXTI teng ekanini
 * tekshiradi — ya'ni "bitta tilda bor, boshqasida yo'q" holatini tutadi.
 *
 * Bu test boshqa xatoni tutadi: kodda ISHLATILGAN, lekin `messages/` da
 * UMUMAN YO'Q kalitni. Uchala faylda birdek yo'q bo'lsa daraxt baribir
 * teng bo'lib qolaveradi, birinchi test uni sezmaydi — sahifada esa
 * "tarjima kaliti topilmadi" chiqadi. Merge'dan keyin eng ko'p uchraydigan
 * xato shu.
 *
 * Skanerlash matn darajasida: `const t = getTranslations("NS")` dan
 * o'zgaruvchi nomi va nomfaza olinadi, keyin shu faylda `t("kalit")`
 * chaqiruvlari yig'iladi.
 */

const ROOT = join(__dirname, "..");
const LOCALES = ["uz", "uz-Cyrl", "ru"] as const;
const SCAN_DIRS = ["app", "components"];

/**
 * CLAUDE.md 1-qoida istisnosi: admin paneli faqat o'zbekcha, i18n'dan ozod.
 * Yo'l bo'lagi sifatida solishtiramiz — "admin" so'zi fayl nomida tasodifan
 * uchrasa uni chetlab o'tmaslik uchun.
 */
function isAdminPath(relative: string): boolean {
  return relative.split(/[\\/]/).includes("admin");
}

type Messages = Record<string, unknown>;

const messages = new Map<string, Messages>(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(ROOT, "messages", `${locale}.json`), "utf-8"),
    ) as Messages,
  ]),
);

/** Nuqtali yo'l bo'yicha qiymatni oladi; yo'q bo'lsa `undefined`. */
function valueAt(messagesForLocale: Messages, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      messagesForLocale,
    );
}

function collectFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, found);
    } else if (/\.tsx?$/.test(full)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * `const t = await getTranslations("NS")` va
 * `const t = await getTranslations({ locale, namespace: "NS" })` —
 * next-intl'ning ikkala chaqiruv shakli ham ishlatiladi.
 */
const BINDING =
  /const\s+(\w+)\s*=\s*(?:await\s+)?(?:get|use)Translations\(\s*(?:"([^"]+)"|\{[^}]*namespace:\s*"([^"]+)"[^}]*\})/g;

type Usage = { file: string; key: string };

const literalUsages: Usage[] = [];
const dynamicParents: Usage[] = [];
let bindingCount = 0;

for (const dir of SCAN_DIRS) {
  for (const file of collectFiles(join(ROOT, dir))) {
    const relative = file.slice(ROOT.length + 1);
    if (isAdminPath(relative)) continue;

    const source = readFileSync(file, "utf-8");

    /**
     * Bitta faylda bitta o'zgaruvchi (odatda `t`) bir nechta nomfazaga
     * bog'langan bo'lishi mumkin. Unda kalit shu nomfazalarning BIRORTASIDA
     * bo'lsa yetarli deb hisoblaymiz — aks holda test yolg'on yiqiladi.
     */
    const namespacesByVar = new Map<string, string[]>();
    for (const match of source.matchAll(BINDING)) {
      const [, variable, direct, viaObject] = match;
      const namespace = direct ?? viaObject;
      if (variable === undefined || namespace === undefined) continue;
      bindingCount += 1;
      const existing = namespacesByVar.get(variable) ?? [];
      if (!existing.includes(namespace)) existing.push(namespace);
      namespacesByVar.set(variable, existing);
    }

    for (const [variable, namespaces] of namespacesByVar) {
      // t("kalit") — to'liq literal
      const literal = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
      for (const call of source.matchAll(literal)) {
        literalUsages.push({
          file: relative,
          key: namespaces.map((ns) => `${ns}.${call[1]}`).join(" | "),
        });
      }

      // t(`kalit.${...}`) — dinamik qism tekshirilmaydi, lekin uni
      // saqlaydigan OBYEKT bor va bo'sh emasligini tekshirish mumkin.
      const dynamic = new RegExp(`\\b${variable}\\(\\s*\`([^\`]*)\``, "g");
      for (const call of source.matchAll(dynamic)) {
        const staticPrefix = (call[1] ?? "").split("${")[0]?.replace(/\.$/, "") ?? "";
        if (staticPrefix === "") continue; // butunlay dinamik — tekshirib bo'lmaydi
        dynamicParents.push({
          file: relative,
          key: namespaces.map((ns) => `${ns}.${staticPrefix}`).join(" | "),
        });
      }
    }
  }
}

/** "A.b | C.b" — variantlardan BIRORTASI topilsa yetarli. */
function resolvesInLocale(key: string, locale: string): boolean {
  return key
    .split(" | ")
    .some((candidate) => valueAt(messages.get(locale)!, candidate) !== undefined);
}

describe("i18n — kodda ishlatilgan kalitlar messages/ da bor", () => {
  /**
   * QOROVULNING QOROVULI: chaqiruv uslubi o'zgarsa (masalan next-intl
   * boshqa API ga o'tsa) regexp hech narsa topmay qoladi va test JIMGINA
   * yashil bo'lib turaveradi. Shuning uchun skaner o'zi ish topganini
   * tasdiqlaymiz.
   */
  it("skaner tarjima chaqiruvlarini topdi", () => {
    expect(bindingCount).toBeGreaterThan(10);
    expect(literalUsages.length).toBeGreaterThan(50);
  });

  it.each(LOCALES)("%s — yetishmaydigan literal kalit yo'q", (locale) => {
    const missing = literalUsages
      .filter((usage) => !resolvesInLocale(usage.key, locale))
      .map((usage) => `${usage.key}  (${usage.file})`);
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s — dinamik kalitlarning obyekti bor", (locale) => {
    const broken = dynamicParents
      .filter((usage) => {
        const found = usage.key
          .split(" | ")
          .map((candidate) => valueAt(messages.get(locale)!, candidate))
          .find((value) => value !== undefined);
        return (
          typeof found !== "object" ||
          found === null ||
          Object.keys(found).length === 0
        );
      })
      .map((usage) => `${usage.key}  (${usage.file})`);
    expect(broken).toEqual([]);
  });
});
