import type { PrismaClient } from "@/lib/generated/prisma/client";
import { rowKey, type TopicRow } from "./csv-schema";

/**
 * CSV qatorlarini kurikulum daraxtiga yozish.
 *
 * Uchta kafolat:
 * 1. TRANZAKSION — bitta qator xato bo'lsa hech narsa yozilmaydi.
 * 2. IDEMPOTENT — kalit (subjectId, grade, slug); ikkinchi marta ishlatilsa
 *    dublikat yaratmaydi.
 * 3. IKKI BOSQICHLI — avval hamma qator yoziladi, keyin `parentId`
 *    bog'lanadi. Shu tufayli ota CSV'da bolasidan KEYIN tursa ham ishlaydi.
 *
 * Prisma client parametr sifatida keladi (import qilinmaydi): skript
 * `DIRECT_URL` bilan o'z client'ini quradi, chunki pooler ortidagi
 * ulanishda uzun interaktiv tranzaksiya ishlamaydi.
 */

/** Tranzaksiya ichidagi client — `$transaction` va `$connect` siz. */
type TxClient = Omit<PrismaClient, `$${string}`>;

export type RowOutcome = "created" | "resurrected" | "updated" | "unchanged";

export type RowChange = {
  key: string;
  outcome: RowOutcome;
  titleUz: string;
};

export type ImportReport = {
  subjectSlug: string;
  dryRun: boolean;
  counts: Record<RowOutcome, number>;
  /** Faqat o'zgargan qatorlar (unchanged bu yerga tushmaydi). */
  changes: RowChange[];
  /** Bazada bor, CSV'da yo'q — TEGILMAYDI, faqat ko'rsatiladi. */
  orphans: Array<{ key: string; titleUz: string }>;
};

/** Kutilgan (foydalanuvchiga ko'rsatiladigan) import xatosi. */
export class ImportError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super(details[0] ?? "Import xatosi");
    this.name = "ImportError";
    this.details = details;
  }
}

/** `--dry-run` da tranzaksiyani qaytarish uchun ichki signal. */
class DryRunRollback extends Error {
  readonly report: ImportReport;
  constructor(report: ImportReport) {
    super("DRY_RUN");
    this.report = report;
  }
}

const TOPIC_FIELDS = {
  id: true,
  grade: true,
  slug: true,
  parentId: true,
  titleUz: true,
  titleUzCyrl: true,
  titleRu: true,
  order: true,
  objectives: true,
  keywords: true,
  hoursPlan: true,
  deletedAt: true,
} as const;

type ExistingTopic = {
  id: string;
  grade: number;
  slug: string;
  parentId: string | null;
  titleUz: string;
  titleUzCyrl: string;
  titleRu: string;
  order: number;
  objectives: string[];
  keywords: string[];
  hoursPlan: number | null;
  deletedAt: Date | null;
};

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** `parentId` bu yerda YO'Q — u ikkinchi bosqichda alohida solishtiriladi. */
function fieldsMatch(existing: ExistingTopic, row: TopicRow): boolean {
  return (
    existing.titleUz === row.titleUz &&
    existing.titleUzCyrl === row.titleUzCyrl &&
    existing.titleRu === row.titleRu &&
    existing.order === row.order &&
    existing.hoursPlan === row.hoursPlan &&
    sameList(existing.objectives, row.objectives) &&
    sameList(existing.keywords, row.keywords)
  );
}

export async function importCurriculum(
  db: PrismaClient,
  options: { subjectSlug: string; rows: TopicRow[]; dryRun: boolean },
): Promise<ImportReport> {
  try {
    return await db.$transaction(
      (tx) => runImport(tx, options),
      // Default 5 s — 45+ qatorli fayl Neon'da albatta timeout bo'lardi.
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof DryRunRollback) return error.report;
    throw error;
  }
}

async function runImport(
  tx: TxClient,
  options: { subjectSlug: string; rows: TopicRow[]; dryRun: boolean },
): Promise<ImportReport> {
  const { subjectSlug, rows, dryRun } = options;

  const subject = await tx.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, slug: true },
  });
  if (!subject) {
    throw new ImportError([
      `Fan topilmadi: "${subjectSlug}". Mavjud fanlarni ko'rish uchun: pnpm db:seed`,
    ]);
  }

  const grades = [...new Set(rows.map((row) => row.grade))];

  // O'chirilganlar ham keladi — ular qayta yaratilmasdan TIRILTIRILADI
  // (@@unique(subjectId, grade, slug) ularni ham qamraydi).
  const existingRows = (await tx.topic.findMany({
    where: { subjectId: subject.id, grade: { in: grades } },
    select: TOPIC_FIELDS,
  })) as ExistingTopic[];

  const existingByKey = new Map(existingRows.map((topic) => [rowKey(topic), topic]));
  const idByKey = new Map<string, string>();
  const outcomeByKey = new Map<string, RowOutcome>();

  // --- 1-bosqich: maydonlar (parentId'siz) ---
  for (const row of rows) {
    const key = rowKey(row);
    const existing = existingByKey.get(key);
    const data = {
      titleUz: row.titleUz,
      titleUzCyrl: row.titleUzCyrl,
      titleRu: row.titleRu,
      order: row.order,
      objectives: row.objectives,
      keywords: row.keywords,
      hoursPlan: row.hoursPlan,
    };

    if (!existing) {
      const created = await tx.topic.create({
        data: { subjectId: subject.id, grade: row.grade, slug: row.slug, ...data },
        select: { id: true },
      });
      idByKey.set(key, created.id);
      outcomeByKey.set(key, "created");
      continue;
    }

    const resurrected = existing.deletedAt !== null;
    const changed = resurrected || !fieldsMatch(existing, row);
    if (changed) {
      await tx.topic.update({
        where: { id: existing.id },
        data: { ...data, deletedAt: null },
      });
    }
    idByKey.set(key, existing.id);
    outcomeByKey.set(key, resurrected ? "resurrected" : changed ? "updated" : "unchanged");
  }

  // --- 2-bosqich: parentId ---
  const missingParents: string[] = [];
  for (const row of rows) {
    const key = rowKey(row);
    let desiredParentId: string | null = null;

    if (row.parentSlug !== null) {
      const parentKey = `${row.grade}/${row.parentSlug}`;
      desiredParentId = idByKey.get(parentKey) ?? existingByKey.get(parentKey)?.id ?? null;
      if (desiredParentId === null) {
        missingParents.push(
          `${row.line}-qator, "parent_slug" ustuni: "${row.parentSlug}" ` +
            `${row.grade}-sinfda topilmadi (na CSV'da, na bazada)`,
        );
        continue;
      }
    }

    const existing = existingByKey.get(key);
    if (existing && existing.parentId === desiredParentId) continue;
    if (!existing && desiredParentId === null) continue;

    await tx.topic.update({ where: { id: idByKey.get(key)! }, data: { parentId: desiredParentId } });
    if (outcomeByKey.get(key) === "unchanged") outcomeByKey.set(key, "updated");
  }

  if (missingParents.length > 0) throw new ImportError(missingParents);

  // --- Yetim mavzular: bazada bor, CSV'da yo'q ---
  // Slug tuzatilganda eski qator jimgina qolib ketmasin. AVTOMATIK
  // O'CHIRILMAYDI — qaror odamniki (admin panelidan).
  const fileKeys = new Set(rows.map(rowKey));
  const orphans = existingRows
    .filter((topic) => topic.deletedAt === null && !fileKeys.has(rowKey(topic)))
    .map((topic) => ({ key: rowKey(topic), titleUz: topic.titleUz }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const counts: Record<RowOutcome, number> = {
    created: 0,
    resurrected: 0,
    updated: 0,
    unchanged: 0,
  };
  const changes: RowChange[] = [];
  for (const row of rows) {
    const key = rowKey(row);
    const outcome = outcomeByKey.get(key)!;
    counts[outcome] += 1;
    if (outcome !== "unchanged") changes.push({ key, outcome, titleUz: row.titleUz });
  }

  const report: ImportReport = { subjectSlug, dryRun, counts, changes, orphans };

  // Dry-run hisoboti TAXMIN emas — haqiqiy yozuvlar natijasi, faqat
  // oxirida qaytarib olinadi.
  if (dryRun) throw new DryRunRollback(report);

  return report;
}
