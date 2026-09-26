import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md, 4-qoida qorovuli: "Kredit faqat generatsiya muvaffaqiyatli
 * tugagach yechiladi. Oqim: hold → generatsiya → charge / release."
 *
 * Bu qoidani har joyda qo'lda bajarish mumkin emas — ertami-kechmi kimdir
 * `prisma.user.update({ data: { creditBalance: ... } })` yozib, holdni ham,
 * daftarni ham chetlab o'tadi. Shuning uchun ikkita struktura cheklovi
 * mashinada tekshiriladi:
 *
 *   1. `CreditTx` ga faqat `lib/credits/ledger.ts` yozadi — daftarning
 *      yagona manbai (`lib/llm/log.ts` `LlmCall` uchun nima bo'lsa, shu).
 *   2. `creditBalance` / `creditsHeld` ga YOZISH faqat o'sha faylda.
 *      O'qish (auth select, admin sahifa, balans chipi) ruxsat — cheklov
 *      faqat yozuvga.
 *
 * Uslub `tests/llm-guard.test.ts` dan olingan.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "server", "scripts", "tests"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES = new Set(["generated", "node_modules"]);

/**
 * Daftarga yozish ruxsat etilgan yagona joylar.
 *
 * Testlar ham ro'yxatda: `SCAN_DIRS` `tests` ni ham skanerlaydi, ya'ni
 * daftar testining o'zi fake `creditTx.create` ni eslatadi.
 *
 * `prisma/seed.ts` ro'yxatda YO'Q va bo'lmasligi kerak: `SCAN_DIRS` da
 * `prisma/` yo'q, ya'ni "ro'yxatdagi fayllar mavjud" testi qizil bo'lardi.
 */
const LEDGER_ALLOWED = new Set([
  "lib/credits/ledger.ts",
  "tests/credits-guard.test.ts",
  "tests/credits-ledger.test.ts",
  "tests/integration/credits-race.test.ts",
]);

const CREDITTX_CREATE = /\.creditTx\s*\.\s*create\b/;

/**
 * Balans ustunlariga YOZISH belgilari:
 *   - raw SQL: `SET "creditBalance"`, `SET "creditsHeld"`
 *   - Prisma: `creditBalance: <qiymat>` (ya'ni `data:` ichidagi qiymat
 *     berish). `creditBalance: true` — `select`, shuning uchun chetlab
 *     o'tiladi.
 *
 * DIQQAT: `\s*` lookahead'ning ICHIDA. Tashqarida bo'lsa regex orqaga qaytib
 * (`\s*` ni nolga qisqartirib) `creditBalance: true` ni ham "yozuv" deb
 * topadi — bu aynan shu testda yuz bergan xato.
 */
const BALANCE_WRITE =
  /SET\s+"(?:creditBalance|creditsHeld)"|(?:creditBalance|creditsHeld):(?!\s*true\b)/;

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

/**
 * Balans YOZUVI tekshiruvi test fiksturalariga tegmaydi: test o'z
 * foydalanuvchisini boshlang'ich balans bilan yaratishi normal va u prodda
 * pulga ta'sir qilmaydi. `CreditTx` tekshiruvi esa hamma joyda ishlaydi.
 */
const productionFiles = files.filter(([rel]) => !rel.startsWith("tests/"));

describe("kredit qatlami qorovuli", () => {
  it("skanerlanadigan fayllar topildi", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files)("%s — CreditTx'ga ruxsatsiz yozilmaydi", (rel, full) => {
    if (LEDGER_ALLOWED.has(rel)) return;
    const content = readFileSync(full, "utf-8");
    expect(
      CREDITTX_CREATE.test(content),
      `${rel}: CreditTx faqat lib/credits/ledger.ts dan yoziladi (CLAUDE.md 4-qoida). ` +
        `Daftarni chetlab o'tgan yozuv balansni haqiqatdan uzadi.`,
    ).toBe(false);
  });

  it.each(productionFiles)("%s — balans ustunlariga ruxsatsiz yozilmaydi", (rel, full) => {
    if (LEDGER_ALLOWED.has(rel)) return;
    const content = readFileSync(full, "utf-8");
    expect(
      BALANCE_WRITE.test(content),
      `${rel}: creditBalance / creditsHeld ga yozish faqat lib/credits/ledger.ts da. ` +
        `Aks holda hold chetlab o'tiladi va CreditTx izsiz qoladi.`,
    ).toBe(false);
  });

  it("ruxsat ro'yxatidagi fayllar haqiqatan mavjud", () => {
    const known = new Set(files.map(([rel]) => rel));
    for (const rel of LEDGER_ALLOWED) {
      expect(known.has(rel), `${rel} ro'yxatda bor, lekin fayl yo'q`).toBe(true);
    }
  });
});
