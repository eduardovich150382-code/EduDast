import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md, 3-qoida qorovuli: "Har LLM chaqiruvida costUsd, tokensIn,
 * tokensOut, modelUsed bazaga yozilishi SHART."
 *
 * Bu qoidani har chaqiruv joyida qo'lda bajarish mumkin emas — ertami-kechmi
 * bittasi unutiladi. Shuning uchun ikkita struktura cheklovi mashinada
 * tekshiriladi:
 *
 *   1. Provayder SDK'lari faqat `lib/llm/providers/` ichida import qilinadi.
 *      Aks holda kimdir to'g'ridan API'ga chiqib, byudjet (5-qoida) va
 *      jurnalni (3-qoida) chetlab o'tishi mumkin.
 *   2. `prisma.llmCall.create` faqat `lib/llm/log.ts` da chaqiriladi —
 *      jurnalning yagona manbai.
 *
 * Uslub `tests/tokens-guard.test.ts` dan olingan (ranglar qorovuli).
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "server", "scripts", "tests"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES = new Set(["generated", "node_modules"]);

/** SDK importi ruxsat etilgan yagona joylar. */
const SDK_ALLOWED = new Set([
  "lib/llm/providers/anthropic.ts",
  "lib/llm/providers/gemini.ts",
  // Skript provayder API'sidan model ro'yxatini oladi — chaqiruv qilmaydi,
  // shuning uchun jurnal ham kerak emas.
  "scripts/llm-models.ts",
  "tests/llm-guard.test.ts",
]);

/** `LlmCall` yozuvi ruxsat etilgan yagona joy. */
const LOG_ALLOWED = new Set(["lib/llm/log.ts", "tests/llm-guard.test.ts"]);

const SDK_IMPORT = /from\s+["'](?:@anthropic-ai\/sdk|@google\/genai)["']|import\(\s*["'](?:@anthropic-ai\/sdk|@google\/genai)["']/;
const LLMCALL_CREATE = /\.llmCall\s*\.\s*create\b/;

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = SCAN_DIRS.flatMap((dir) => listFiles(join(ROOT, dir))).map(
  (f) => [relative(ROOT, f).split("\\").join("/"), f] as const,
);

describe("LLM qatlami qorovuli", () => {
  it("skanerlanadigan fayllar topildi", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files)("%s — provayder SDK'si ruxsatsiz import qilinmagan", (rel, full) => {
    if (SDK_ALLOWED.has(rel)) return;
    const content = readFileSync(full, "utf-8");
    expect(
      SDK_IMPORT.test(content),
      `${rel}: provayder SDK'si faqat lib/llm/providers/ ichida import qilinadi. ` +
        `To'g'ridan chaqiruv byudjet va xarajat jurnalini chetlab o'tadi.`,
    ).toBe(false);
  });

  it.each(files)("%s — LlmCall'ga ruxsatsiz yozilmaydi", (rel, full) => {
    if (LOG_ALLOWED.has(rel)) return;
    const content = readFileSync(full, "utf-8");
    expect(
      LLMCALL_CREATE.test(content),
      `${rel}: LlmCall faqat lib/llm/log.ts dan yoziladi (CLAUDE.md 3-qoida).`,
    ).toBe(false);
  });

  it("ruxsat ro'yxatidagi fayllar haqiqatan mavjud", () => {
    const known = new Set(files.map(([rel]) => rel));
    for (const rel of [...SDK_ALLOWED, ...LOG_ALLOWED]) {
      expect(known.has(rel), `${rel} ro'yxatda bor, lekin fayl yo'q`).toBe(true);
    }
  });
});
