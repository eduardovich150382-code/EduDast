import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md, 11-qoida qorovuli: komponent reyestrida (`kind -> Component`
 * switch) qaytish turi `): ReactElement` deb annotatsiya qilinishi SHART.
 *
 * NEGA QOROVUL KERAK: annotatsiyasiz React komponenti `undefined`
 * qaytarishi mumkin, ya'ni `default` tarmog'ining yo'qligi HECH NARSANI
 * kafolatlamaydi — yetishmagan `case` jimgina bo'sh ekran beradi va `tsc`
 * xato bermaydi.
 *
 * 15-sessiyada uch fayl aynan shu holatda topildi, hammasining izohida
 * "TypeScript shu yerda yiqiladi" deb yozilgan edi. Izoh qorovul emas —
 * shuning uchun bu test yozildi.
 *
 * MATN DARAJASIDA ishlaydi (`tokens-guard` naqshi): vitest muhiti `node`,
 * React yo'q, ya'ni komponentni import qilib tekshirib bo'lmaydi. Shuning
 * uchun qorovul JSX qaytaradigan switch'ni TOPADI va annotatsiyasini
 * talab qiladi.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components"];
const SKIP_DIR_NAMES = new Set(["generated", "node_modules"]);

/**
 * Switch tarmog'ida bevosita JSX qaytaradigan funksiya.
 *
 * `return <Foo` yoki `return (\n <Foo` — ikkisi ham reyestr naqshi.
 */
const SWITCH_WITH_JSX = /switch\s*\([^)]*\)\s*\{[\s\S]{0,4000}?\n\s*case\s[\s\S]{0,4000}?return\s*\(?\s*</;

/** `): ReactElement` yoki `): ReactElement | null` kabi annotatsiya. */
const ANNOTATED = /\)\s*:\s*(?:React\.)?ReactElement\b/;

/**
 * Annotatsiya TALAB QILINMAYDIGAN fayllar.
 *
 * Ro'yxat pastdagi alohida test bilan qulflangan: har yangi istisno ongli
 * qaror bo'lishi va sababi shu yerda yozilishi kerak.
 */
const EXEMPT: Record<string, string> = {
  // Switch `string` qaytaradi (`paramsSummary(): string`), ya'ni
  // yetishmagan tarmoq allaqachon TS2366 beradi. JSX naqshiga tasodifan
  // tushadi, chunki faylda boshqa joyda JSX bor.
  "app/[locale]/ish/yarat/page.tsx": "switch JSX emas, string qaytaradi",
};

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Izohlar olib tashlangan matn — izohdagi `switch` so'zi hisobga olinmasin. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const files = SCAN_DIRS.flatMap((dir) => listFiles(join(ROOT, dir)));

const registries = files.filter((file) => {
  const code = withoutComments(readFileSync(file, "utf-8"));
  return SWITCH_WITH_JSX.test(code);
});

describe("komponent reyestri qorovuli (CLAUDE.md 11-qoida)", () => {
  it("skaner reyestr topadi — naqsh o'lik qolmasin", () => {
    // Naqsh buzilsa ro'yxat bo'shab qoladi va test JIMGINA yashil
    // bo'lardi. 15-sessiyada to'rtta reyestr bor.
    expect(registries.length).toBeGreaterThanOrEqual(4);
  });

  it.each(registries.map((f) => [relative(ROOT, f).split("\\").join("/"), f] as const))(
    "%s qaytish turi annotatsiya qilingan",
    (relPath, fullPath) => {
      if (relPath in EXEMPT) return;

      const code = withoutComments(readFileSync(fullPath, "utf-8"));
      expect(
        ANNOTATED.test(code),
        `${relPath}: JSX qaytaradigan switch bor, lekin "): ReactElement" annotatsiyasi yo'q. ` +
          `Annotatsiyasiz "default yo'q" kafolati ishlamaydi — yetishmagan case jimgina ` +
          `bo'sh ekran beradi (CLAUDE.md 11-qoida).`,
      ).toBe(true);
    },
  );

  it("istisnolar ro'yxati qulflangan", () => {
    // Istisno qo'shish qorovulni shu fayl uchun o'chirish bilan teng,
    // shuning uchun u ongli va sababi yozilgan bo'lishi kerak.
    expect(Object.keys(EXEMPT)).toEqual(["app/[locale]/ish/yarat/page.tsx"]);
    for (const reason of Object.values(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("ma'lum reyestrlarning hammasi qamrab olingan", () => {
    // Naqsh bu to'rttasini TOPISHI kerak. Topmasa — regex buzilgan va
    // qorovul jimgina ishlamay qolgan.
    const found = new Set(registries.map((f) => relative(ROOT, f).split("\\").join("/")));
    for (const expected of [
      "components/editor/blocks/index.tsx",
      "components/games/registry.tsx",
      "components/generation/document-blocks.tsx",
      "components/slides/layouts/index.tsx",
    ]) {
      expect(found.has(expected), `${expected} skanerdan o'tib ketdi`).toBe(true);
    }
  });
});
