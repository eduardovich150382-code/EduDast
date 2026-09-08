import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import {
  checkColumns,
  parseCurriculumRows,
  type RawCsvRecord,
} from "../lib/curriculum/csv-schema";
import { ImportError, importCurriculum, type ImportReport } from "../lib/curriculum/import";
import { createScriptDb } from "./script-db";

/**
 * Kurikulum CSV importi.
 *
 *   pnpm curriculum:import <fayl.csv> --subject fizika [--dry-run]
 *
 * Bu fayl — faqat QOBIQ: argument o'qish, CSV'ni tahlil qilish va hisobot
 * chiqarish. Validatsiya lib/curriculum/csv-schema.ts da, bazaga yozish
 * lib/curriculum/import.ts da (ikkalasi ham testlanadi).
 */

const USAGE = `Ishlatilishi:
  pnpm curriculum:import <fayl.csv> --subject <fan-slug> [--dry-run]

Misol:
  pnpm curriculum:import fixtures/fizika-7-namuna.csv --subject fizika --dry-run

CSV formati: docs/curriculum-csv.md`;

type Args = { file: string; subject: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  let file: string | null = null;
  let subject: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--subject") {
      subject = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--subject=")) {
      subject = arg.slice("--subject=".length);
    } else if (arg.startsWith("--")) {
      throw new ImportError([`Noma'lum bayroq: ${arg}`, USAGE]);
    } else if (file === null) {
      file = arg;
    } else {
      throw new ImportError([`Ortiqcha argument: ${arg}`, USAGE]);
    }
  }

  if (!file) throw new ImportError(["CSV fayl ko'rsatilmagan.", USAGE]);
  if (!subject) throw new ImportError(["--subject ko'rsatilmagan.", USAGE]);
  return { file, subject, dryRun };
}

function readRecords(file: string): RawCsvRecord[] {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    throw new ImportError([`Fayl o'qib bo'lmadi: ${file}`]);
  }

  let headers: string[] = [];
  let records: RawCsvRecord[];
  try {
    records = parse(content, {
      // Excel "UTF-8 CSV" sifatida saqlaganda faylni BOM bilan boshlaydi —
      // usiz birinchi ustun nomi "﻿grade" bo'lib qolardi.
      bom: true,
      skip_empty_lines: true,
      columns: (header: string[]) => {
        headers = header.map((name) => name.trim());
        return headers;
      },
    }) as RawCsvRecord[];
  } catch (error) {
    throw new ImportError([
      `CSV tahlil qilinmadi: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  const columnErrors = checkColumns(headers);
  if (columnErrors.length > 0) throw new ImportError(columnErrors);
  if (records.length === 0) throw new ImportError(["CSV bo'sh — sarlavhadan keyin qator yo'q."]);

  return records;
}

function printReport(report: ImportReport): void {
  const { counts, changes, orphans } = report;

  if (report.dryRun) {
    console.log("\n--dry-run: bazaga HECH NARSA yozilmadi.\n");
  }

  console.log(
    `Yaratildi: ${counts.created} · Tiriltirildi: ${counts.resurrected} · ` +
      `Yangilandi: ${counts.updated} · O'zgarmadi: ${counts.unchanged}`,
  );

  if (changes.length > 0) {
    console.log("");
    for (const change of changes) {
      console.log(`  [${change.outcome}] ${change.key}  "${change.titleUz}"`);
    }
  }

  if (orphans.length > 0) {
    console.log(`\nCSV'da yo'q, bazada bor: ${orphans.length} ta (tegilmadi)`);
    for (const orphan of orphans) {
      console.log(`  - ${orphan.key}  "${orphan.titleUz}"`);
    }
    console.log("  Kerak bo'lsa /admin/mavzular dan o'chiring.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = readRecords(args.file);

  const parsed = parseCurriculumRows(records);
  if (!parsed.ok) throw new ImportError(parsed.errors);

  const db = createScriptDb();
  try {
    const report = await importCurriculum(db, {
      subjectSlug: args.subject,
      rows: parsed.rows,
      dryRun: args.dryRun,
    });
    printReport(report);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof ImportError) {
    console.error(`\nImport bajarilmadi (${error.details.length} ta xato):\n`);
    for (const detail of error.details) console.error(`  ${detail}`);
    console.error("");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
