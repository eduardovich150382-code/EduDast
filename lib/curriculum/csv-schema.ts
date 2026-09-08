import { z } from "zod";

/**
 * CSV qatorlarini tekshirish va normallashtirish — SOF modul: bazaga ham,
 * fayl tizimiga ham bormaydi. Shu ajratish tufayli butun validatsiya
 * jadvali oddiy unit test bilan qoplanadi (tests/curriculum-csv.test.ts).
 *
 * Faylni o'qish va csv-parse chaqiruvi — scripts/curriculum-import.ts da,
 * bazaga yozish — lib/curriculum/import.ts da.
 */

export const CSV_COLUMNS = [
  "grade",
  "parent_slug",
  "slug",
  "title_uz",
  "title_uz_cyrl",
  "title_ru",
  "order",
  "objectives",
  "keywords",
  "hours_plan",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** csv-parse `columns: true` bilan aynan shunday shakl qaytaradi. */
export type RawCsvRecord = Record<string, string | undefined>;

export type TopicRow = {
  /** CSV faylidagi qator raqami (sarlavha 1-qator) — xato xabari uchun. */
  line: number;
  grade: number;
  /** null — ildiz tugun (bo'lim). */
  parentSlug: string | null;
  slug: string;
  titleUz: string;
  titleUzCyrl: string;
  titleRu: string;
  order: number;
  objectives: string[];
  keywords: string[];
  hoursPlan: number | null;
};

export type ParseResult = { ok: true; rows: TopicRow[] } | { ok: false; errors: string[] };

export const MIN_GRADE_CSV = 1;
export const MAX_GRADE_CSV = 11;

/** Bazadagi slug — faqat kichik lotin harflari, raqam va bitta chiziqcha. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INT_RE = /^-?\d+$/;

/** "a|b||c" -> ["a","b","c"]. Bo'sh elementlar tashlanadi. */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const requiredTitle = (nomi: string) =>
  z
    .string({ error: `${nomi} majburiy` })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, `${nomi} bo'sh bo'lishi mumkin emas`)
    .refine((value) => value.length <= 200, `${nomi} 200 belgidan uzun`);

const rowSchema = z.object({
  grade: z
    .string({ error: "majburiy" })
    .transform((value) => value.trim())
    .refine((value) => INT_RE.test(value), "butun son bo'lishi kerak")
    .transform(Number)
    .refine(
      (value) => value >= MIN_GRADE_CSV && value <= MAX_GRADE_CSV,
      `${MIN_GRADE_CSV} dan ${MAX_GRADE_CSV} gacha bo'lishi kerak`,
    ),

  parent_slug: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value === "" || SLUG_RE.test(value), "slug shakli noto'g'ri")
    .transform((value) => (value === "" ? null : value)),

  slug: z
    .string({ error: "majburiy" })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "bo'sh bo'lishi mumkin emas")
    .refine(
      (value) => SLUG_RE.test(value),
      "faqat kichik lotin harflari, raqam va chiziqcha (masalan: mexanik-harakat)",
    ),

  title_uz: requiredTitle("o'zbekcha sarlavha"),
  title_uz_cyrl: requiredTitle("kirillcha sarlavha"),
  title_ru: requiredTitle("ruscha sarlavha"),

  order: z
    .string({ error: "majburiy" })
    .transform((value) => value.trim())
    .refine((value) => INT_RE.test(value), "butun son bo'lishi kerak")
    .transform(Number)
    .refine((value) => value >= 0, "manfiy bo'lishi mumkin emas"),

  objectives: z.string().optional().transform(splitList),

  keywords: z.string().optional().transform(splitList),

  hours_plan: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value === "" || INT_RE.test(value), "butun son bo'lishi kerak")
    .transform((value) => (value === "" ? null : Number(value)))
    .refine((value) => value === null || value > 0, "0 dan katta bo'lishi kerak"),
});

/**
 * Ustun sarlavhalarini tekshiradi. csv-parse `columns: true` bilan birinchi
 * qatorni kalitlarga aylantiradi, shuning uchun yetishmayotgan ustun keyingi
 * bosqichda "majburiy" xatolar sharsharasiga aylanadi — buni oldindan bitta
 * tushunarli xato bilan to'xtatamiz.
 */
export function checkColumns(headers: string[]): string[] {
  const seen = new Set(headers.map((header) => header.trim()));
  const missing = CSV_COLUMNS.filter((column) => !seen.has(column));
  if (missing.length === 0) return [];
  return [
    `Sarlavha qatorida ustun(lar) yetishmayapti: ${missing.join(", ")}. ` +
      `Kutilgan tartib: ${CSV_COLUMNS.join(",")}`,
  ];
}

function formatIssue(line: number, record: RawCsvRecord, issue: z.core.$ZodIssue): string {
  const column = String(issue.path[0] ?? "?");
  const raw = record[column];
  const found = raw === undefined ? "ustun yo'q" : `"${raw}"`;
  return `${line}-qator, "${column}" ustuni: ${issue.message} (topildi: ${found})`;
}

/**
 * Barcha qatorlarni tekshiradi. Birinchi xatoda TO'XTAMAYDI — o'qituvchi
 * 200 qatorli faylni bir marta tuzatib qayta yuborsin, har safar bitta xato
 * ko'rib emas.
 */
export function parseCurriculumRows(records: RawCsvRecord[]): ParseResult {
  const errors: string[] = [];
  const rows: TopicRow[] = [];

  records.forEach((record, index) => {
    const line = index + 2; // 1-qator — sarlavha
    const parsed = rowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(formatIssue(line, record, issue));
      }
      return;
    }
    const data = parsed.data;
    rows.push({
      line,
      grade: data.grade,
      parentSlug: data.parent_slug,
      slug: data.slug,
      titleUz: data.title_uz,
      titleUzCyrl: data.title_uz_cyrl,
      titleRu: data.title_ru,
      order: data.order,
      objectives: data.objectives,
      keywords: data.keywords,
      hoursPlan: data.hours_plan,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const structural = checkStructure(rows);
  if (structural.length > 0) return { ok: false, errors: structural };

  return { ok: true, rows };
}

/** `(grade, slug)` — Topic'ning fan ichidagi yagona kaliti. */
export function rowKey(row: { grade: number; slug: string }): string {
  return `${row.grade}/${row.slug}`;
}

/**
 * Fayl darajasidagi tekshiruvlar: dublikat kalit, o'ziga ota bo'lish va
 * ota-bola sikli. Sikl bazaga yozilsa daraxt render qilinganda cheksiz
 * rekursiyaga aylanadi, shuning uchun import'gacha to'xtatiladi.
 *
 * Ota faylda yo'q bo'lishi XATO EMAS — u bazada allaqachon turgan bo'lishi
 * mumkin (bo'limlar alohida faylda import qilingan bo'lishi mumkin). Buni
 * lib/curriculum/import.ts bazaga qarab tekshiradi.
 */
function checkStructure(rows: TopicRow[]): string[] {
  const errors: string[] = [];
  const byKey = new Map<string, TopicRow>();

  for (const row of rows) {
    const key = rowKey(row);
    const previous = byKey.get(key);
    if (previous) {
      errors.push(
        `${row.line}-qator, "slug" ustuni: (${row.grade}-sinf, "${row.slug}") ` +
          `juftligi ${previous.line}-qatorda allaqachon bor`,
      );
      continue;
    }
    byKey.set(key, row);
  }
  if (errors.length > 0) return errors;

  for (const row of rows) {
    if (row.parentSlug === null) continue;
    if (row.parentSlug === row.slug) {
      errors.push(`${row.line}-qator, "parent_slug" ustuni: mavzu o'ziga ota bo'la olmaydi`);
      continue;
    }

    // Sikl: ota zanjirini faqat FAYL ichida kuzatamiz. Zanjir fayldan chiqib
    // ketsa (ota bazada), sikl bo'lishi mumkin emas — bazadagi daraxt
    // allaqachon siklsiz.
    const seen = new Set<string>([rowKey(row)]);
    let current: TopicRow | undefined = byKey.get(`${row.grade}/${row.parentSlug}`);
    while (current?.parentSlug) {
      const key = rowKey(current);
      if (seen.has(key)) {
        errors.push(
          `${row.line}-qator, "parent_slug" ustuni: ota-bola sikli ` +
            `("${row.slug}" -> ... -> "${row.slug}")`,
        );
        break;
      }
      seen.add(key);
      current = byKey.get(`${current.grade}/${current.parentSlug}`);
    }
  }

  return errors;
}
