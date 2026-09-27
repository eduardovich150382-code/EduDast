import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RSC serializatsiya qorovuli.
 *
 * Server komponentdan `"use client"` komponentga FUNKSIYA uzatib bo'lmaydi —
 * runtime'da "Functions cannot be passed directly to Client Components"
 * xatosi chiqadi. `pnpm build` buni ushlamaydi (tip jihatidan to'g'ri,
 * faqat ishlash vaqtida yiqiladi), shuning uchun shu qorovul kerak.
 *
 * Tarix: `onboarding/sinflar` sahifasi `gradeLabel={(grade) => t(...)}` ni
 * `GradesStep` ("use client") ga uzatgan va PRODDA har bir yangi
 * foydalanuvchini 2-qadamda to'xtatib qo'ygan.
 *
 * Qorovul faqat ISHONCHLI shaklni tekshiradi: `prop={(`, `prop={function`,
 * `prop={async`. Nomi bilan uzatilgan funksiya (`prop={handler}`) tekshirilmaydi
 * — u yerda regex funksiya bilan oddiy o'zgaruvchini ajrata olmaydi.
 * Shuning uchun bu qorovul to'liq kafolat emas, lekin yuqoridagi xatoning
 * aynan o'zi qaytib kelsa — qizil bo'ladi.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components"];
const SKIP_DIR_NAMES = new Set(["generated", "node_modules"]);

/** `prop={(`, `prop={function ...`, `prop={async ...` — ochiqdan-ochiq funksiya. */
const FUNCTION_PROP = /(?<!\.)\b([a-zA-Z_$][\w$]*)\s*=\s*\{\s*(\(|function\b|async\b)/g;

function listTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) files.push(...listTsxFiles(fullPath));
    else if (entry.endsWith(".tsx")) files.push(fullPath);
  }
  return files;
}

/**
 * Faylning boshida `"use client"` direktivasi bormi. Izohlar olib tashlanadi:
 * `components/plan/status-badge.tsx` izohida `"use client"` SO'ZI bor, lekin
 * direktivasi yo'q — oddiy `grep` shu yerda yanglishadi.
 */
function isClientFile(content: string): boolean {
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .trimStart();
  return /^["']use client["']/.test(withoutComments);
}

const allFiles = SCAN_DIRS.flatMap((dir) => listTsxFiles(join(ROOT, dir)));
const clientFiles = new Set(allFiles.filter((f) => isClientFile(readFileSync(f, "utf-8"))));
const serverFiles = allFiles.filter((f) => !clientFiles.has(f));

/** `@/components/x` yoki `./x` ni haqiqiy fayl yo'liga aylantirish. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Shu faylga client komponentlardan kirib kelgan JSX nomlari (alias hisobga olinadi). */
function clientComponentNames(file: string, content: string): Set<string> {
  const names = new Set<string>();
  const importRe = /import\s+([^;]+?)\s+from\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(importRe)) {
    const clause = match[1] ?? "";
    const specifier = match[2] ?? "";
    const target = resolveImport(file, specifier);
    if (!target || !clientFiles.has(target)) continue;

    const braced = clause.match(/\{([^}]*)\}/)?.[1] ?? "";
    const defaultName = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    if (defaultName && /^[A-Z][\w$]*$/.test(defaultName)) names.add(defaultName);
    for (const part of braced.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Z][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** `<Name ...>` ochilish tegining ichidagi matn (qavs chuqurligi bo'yicha). */
function openingTags(content: string, name: string): string[] {
  const tags: string[] = [];
  const startRe = new RegExp(`<${name}(?![\\w$])`, "g");
  for (const match of content.matchAll(startRe)) {
    let depth = 0;
    let index = match.index + match[0].length;
    for (; index < content.length; index += 1) {
      const char = content[index];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    tags.push(content.slice(match.index, index));
  }
  return tags;
}

function findViolations(file: string, content: string): string[] {
  const violations: string[] = [];
  for (const name of clientComponentNames(file, content)) {
    for (const tag of openingTags(content, name)) {
      for (const match of tag.matchAll(FUNCTION_PROP)) {
        violations.push(`<${name} ${match[1]}={...}>`);
      }
    }
  }
  return violations;
}

describe("RSC serializatsiya qorovuli", () => {
  it("kamida bitta client komponent topildi (qorovul haqiqatan skanerlaydi)", () => {
    expect(clientFiles.size).toBeGreaterThan(0);
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it.each(serverFiles.map((f) => [relative(ROOT, f).split("\\").join("/"), f] as const))(
    "%s client komponentga funksiya uzatmaydi",
    (_relPath, fullPath) => {
      expect(findViolations(fullPath, readFileSync(fullPath, "utf-8"))).toEqual([]);
    },
  );

  it("xato naqshini haqiqatan ushlaydi", () => {
    // Sun'iy namuna: qorovul o'chib qolmasin (soxta yashil test bo'lmasin).
    const sample = [
      'import { GradesStep } from "@/components/onboarding/grades-step";',
      "<GradesStep grades={GRADES} gradeLabel={(grade) => t(grade)} />",
    ].join("\n");
    const found = findViolations(join(ROOT, "app", "sample.tsx"), sample);
    expect(found).toEqual(["<GradesStep gradeLabel={...}>"]);
  });
});
