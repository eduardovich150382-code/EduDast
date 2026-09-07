import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md, 2-qoida qorovuli: "Hardcode rang yo'q. Faqat styles/tokens.css
 * dagi CSS o'zgaruvchilari." styles/tokens.css'dan tashqari hech bir manba
 * faylida hex rang yoki Tailwind'ning tayyor palitra klasslari
 * (masalan `bg-red-500`, `text-[#123456]`) bo'lmasligi kerak.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "server", "styles"];
const ALLOWED_HEX_FILES = new Set(["styles/tokens.css"]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const SKIP_DIR_NAMES = new Set(["generated", "node_modules"]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const TAILWIND_PALETTE_CLASS =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|caret|divide|accent|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone)-\d{2,3}\b/g;
const ARBITRARY_COLOR_VALUE = /-\[(#|rgb|hsl|oklch)/g;

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = SCAN_DIRS.flatMap((dir) => listFiles(join(ROOT, dir)));

describe("dizayn tokenlari qorovuli", () => {
  it.each(files.map((f) => [relative(ROOT, f), f] as const))(
    "%s da hardcode rang yo'q",
    (relPath, fullPath) => {
      const content = readFileSync(fullPath, "utf-8");
      const normalizedRel = relPath.split("\\").join("/");

      if (!ALLOWED_HEX_FILES.has(normalizedRel)) {
        expect(content.match(HEX_COLOR)).toBeNull();
      }
      expect(content.match(TAILWIND_PALETTE_CLASS)).toBeNull();
      expect(content.match(ARBITRARY_COLOR_VALUE)).toBeNull();
    },
  );
});
