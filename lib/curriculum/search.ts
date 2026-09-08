import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Kurikulum bo'yicha semantik qidiruv (pgvector).
 *
 * NEGA HAMMASI $queryRaw: `Topic.embedding` va `SourceChunk.embedding` —
 * `Unsupported("vector(768)")`, Prisma Client ularni o'qiy ham, yoza ham
 * olmaydi (prisma/schema.prisma dagi izohga qarang). Demak filtrlar ham
 * QO'LDA yoziladi — Prisma'ning `where` mantig'i bu so'rovlarga tegmaydi.
 * Ayniqsa `"deletedAt" IS NULL`: uni unutish o'chirilgan mavzuni qidiruvda
 * qayta paydo qiladi.
 *
 * XAVFSIZLIK: barcha qiymatlar tagged template (`Prisma.sql`) orqali
 * PARAMETR sifatida uzatiladi — satr birikmasi yo'q, SQL injection yo'q.
 *
 * Embeddinglarni KIM yozadi: hozircha hech kim — LLM router 4-sessiyada
 * quriladi. Bu modul o'sha paytga tayyor turadi va integratsiya testida
 * soxta vektorlar bilan sinaladi.
 */

/** Model o'lchami (schema.prisma: vector(768)). */
export const EMBEDDING_DIM = 768;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export type TopicMatch = {
  id: string;
  slug: string;
  grade: number;
  titleUz: string;
  subjectId: string;
  /** 1 = aynan bir xil, 0 = butunlay boshqa (cosine similarity). */
  similarity: number;
};

export type ChunkMatch = {
  id: string;
  topicId: string;
  sourceRef: string;
  content: string;
  similarity: number;
};

/** `$transaction` ichida ham ishlatilishi uchun client parametrik. */
type Db = Pick<PrismaClient, "$queryRaw">;

/**
 * `db` berilmasa — ilovaning odatdagi client'i.
 *
 * Import ATAYLAB dinamik: `lib/db.ts` modul yuklanishida DATABASE_URL bilan
 * client quradi, integratsiya testi esa o'zining TEST_DATABASE_URL client'ini
 * uzatadi va asosiy bazaga umuman tegmasligi kerak.
 */
async function resolveDb(db: Db | undefined): Promise<Db> {
  if (db) return db;
  const { prisma } = await import("@/lib/db");
  return prisma;
}

/**
 * Vektorni `vector` literaliga aylantiradi.
 *
 * Uzunlik shu yerda tekshiriladi: noto'g'ri o'lcham Postgres'ning
 * "expected 768 dimensions, not 3" xatosiga aylanib, chaqiruvchiga
 * tushunarsiz stack trace bo'lib qaytardi.
 */
function toVector(embedding: number[]): Prisma.Sql {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding o'lchami ${EMBEDDING_DIM} bo'lishi kerak (topildi: ${embedding.length}).`,
    );
  }
  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding ichida son bo'lmagan qiymat bor (NaN/Infinity).");
  }
  return Prisma.sql`${JSON.stringify(embedding)}::vector`;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

/**
 * Berilgan embeddingga eng yaqin mavzular.
 *
 * `ORDER BY embedding <=> $vec` — HNSW indeks (vector_cosine_ops) AYNAN shu
 * shaklda ishlaydi. Ifodani o'zgartirish (masalan `1 - (...)` bo'yicha
 * saralash) indeksni jimgina o'chiradi va so'rov to'liq skanga tushadi.
 */
export async function findSimilarTopics(
  embedding: number[],
  opts: { subjectId?: string; grade?: number; limit?: number; db?: Db } = {},
): Promise<TopicMatch[]> {
  const vector = toVector(embedding);
  const db = await resolveDb(opts.db);

  const filters: Prisma.Sql[] = [
    Prisma.sql`"embedding" IS NOT NULL`,
    Prisma.sql`"deletedAt" IS NULL`,
  ];
  if (opts.subjectId !== undefined) filters.push(Prisma.sql`"subjectId" = ${opts.subjectId}`);
  if (opts.grade !== undefined) filters.push(Prisma.sql`"grade" = ${opts.grade}`);

  return db.$queryRaw<TopicMatch[]>`
    SELECT "id", "slug", "grade", "titleUz", "subjectId",
           1 - ("embedding" <=> ${vector}) AS "similarity"
    FROM "Topic"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY "embedding" <=> ${vector}
    LIMIT ${clampLimit(opts.limit)}
  `;
}

/**
 * Berilgan embeddingga eng yaqin manba bo'laklari.
 *
 * SourceChunk'da `deletedAt` yo'q, shuning uchun Topic bilan JOIN qilinadi:
 * o'chirilgan mavzuning bo'laklari qidiruvda chiqmasligi kerak.
 */
export async function findSimilarChunks(
  embedding: number[],
  opts: { topicId?: string; limit?: number; db?: Db } = {},
): Promise<ChunkMatch[]> {
  const vector = toVector(embedding);
  const db = await resolveDb(opts.db);

  const filters: Prisma.Sql[] = [
    Prisma.sql`c."embedding" IS NOT NULL`,
    Prisma.sql`t."deletedAt" IS NULL`,
  ];
  if (opts.topicId !== undefined) filters.push(Prisma.sql`c."topicId" = ${opts.topicId}`);

  return db.$queryRaw<ChunkMatch[]>`
    SELECT c."id", c."topicId", c."sourceRef", c."content",
           1 - (c."embedding" <=> ${vector}) AS "similarity"
    FROM "SourceChunk" c
    JOIN "Topic" t ON t."id" = c."topicId"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY c."embedding" <=> ${vector}
    LIMIT ${clampLimit(opts.limit)}
  `;
}
