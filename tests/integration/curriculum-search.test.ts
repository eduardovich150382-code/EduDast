import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMBEDDING_DIM, findSimilarChunks, findSimilarTopics } from "@/lib/curriculum/search";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * lib/curriculum/search.ts — HAQIQIY Postgres kerak (pgvector, HNSW).
 *
 * BAZA XAVFSIZLIGI: bu test FAQAT `TEST_DATABASE_URL` bilan ishlaydi.
 * Loyihada hozircha bitta Neon bazasi bor (lokal = prod), shuning uchun:
 *   - env yo'q bo'lsa test jimgina SKIP bo'ladi (`pnpm test` baribir yashil)
 *   - `TEST_DATABASE_URL === DATABASE_URL` bo'lsa test ataylab yiqiladi
 *   - `lib/db.ts` singleton'i IMPORT QILINMAYDI — o'z client'imiz quriladi,
 *     qidiruv funksiyalariga `db` sifatida uzatiladi
 *
 * Test branch tartibi (.env.example ga ham yozilgan): branch migratsiyadan
 * KEYIN ochiladi, yoki unga `prisma migrate deploy` ishlatiladi. Aks holda
 * branch'da `Topic.deletedAt` ham, HNSW indekslari ham bo'lmaydi.
 */

const TEST_URL = process.env.TEST_DATABASE_URL;

/** Barcha test yozuvlari shu prefiksli Subject ostida — tozalash uchun. */
const PREFIX = "test-search-";
const runId = `${PREFIX}${Date.now()}`;

/**
 * `first`/`second` dan boshqa hamma o'lcham nol. Cosine o'xshashligi shu
 * ikki sondan kelib chiqadi, ya'ni kutilgan tartib oldindan ma'lum.
 * To'liq nol vektor ATAYLAB ishlatilmaydi — cosine masofasi aniqlanmagan.
 */
function vec(first: number, second: number): number[] {
  const values = new Array<number>(EMBEDDING_DIM).fill(0);
  values[0] = first;
  values[1] = second;
  return values;
}

const QUERY = vec(1, 0);
// Kutilgan o'xshashlik: A = 1 · B ≈ 0.707 · C ≈ 0.316 · D = 0
const V_A = vec(1, 0);
const V_B = vec(1, 1);
const V_C = vec(1, 3);
const V_D = vec(0, 1);

let db: PrismaClient;
const ids: Record<string, string> = {};

async function purge(client: PrismaClient): Promise<void> {
  const subjects = await client.subject.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  const subjectIds = subjects.map((subject) => subject.id);
  if (subjectIds.length === 0) return;

  // Sxemada onDelete: Cascade yo'q — tartib qo'lda: chunk -> topic -> subject.
  // Bu HARD delete: test artefakti, soft delete qoidasi unga tegishli emas.
  await client.sourceChunk.deleteMany({ where: { topic: { subjectId: { in: subjectIds } } } });
  await client.topic.deleteMany({ where: { subjectId: { in: subjectIds } } });
  await client.subject.deleteMany({ where: { id: { in: subjectIds } } });
}

async function setEmbedding(table: "Topic" | "SourceChunk", id: string, embedding: number[]) {
  const literal = JSON.stringify(embedding);
  if (table === "Topic") {
    await db.$executeRaw`UPDATE "Topic" SET "embedding" = ${literal}::vector WHERE "id" = ${id}`;
  } else {
    await db.$executeRaw`UPDATE "SourceChunk" SET "embedding" = ${literal}::vector WHERE "id" = ${id}`;
  }
}

describe.skipIf(!TEST_URL)("kurikulum qidiruvi (pgvector)", () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_URL) {
      throw new Error(
        "TEST_DATABASE_URL asosiy baza bilan bir xil. Neon'da alohida test branch oching " +
          "(.env.example dagi izohga qarang) — bu test ma'lumot yaratadi va o'chiradi.",
      );
    }

    db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: TEST_URL }) });

    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name"::text FROM information_schema.columns
      WHERE "table_name" = 'Topic' AND "column_name" = 'deletedAt'
    `;
    if (columns.length === 0) {
      throw new Error(
        "Test bazasida Topic.deletedAt yo'q. Test branch'ga migratsiyalarni qo'llang: " +
          'DATABASE_URL="<branch URL>" pnpm prisma migrate deploy',
      );
    }

    // Oldingi run crash bo'lib axlat qoldirgan bo'lsa ham toza boshlaymiz.
    await purge(db);

    const subject = await db.subject.create({
      data: {
        slug: runId,
        nameUz: "Test fan",
        nameUzCyrl: "Тест фан",
        nameRu: "Тестовый предмет",
      },
      select: { id: true },
    });
    const otherSubject = await db.subject.create({
      data: {
        slug: `${runId}-boshqa`,
        nameUz: "Boshqa",
        nameUzCyrl: "Бошқа",
        nameRu: "Другой",
      },
      select: { id: true },
    });
    ids.subject = subject.id;
    ids.otherSubject = otherSubject.id;

    const topic = async (
      slug: string,
      grade: number,
      subjectId: string,
      deletedAt: Date | null = null,
    ) =>
      (
        await db.topic.create({
          data: {
            subjectId,
            grade,
            slug,
            titleUz: slug,
            titleUzCyrl: slug,
            titleRu: slug,
            order: 1,
            objectives: [],
            keywords: [],
            deletedAt,
          },
          select: { id: true },
        })
      ).id;

    ids.a = await topic("a", 7, subject.id);
    ids.b = await topic("b", 7, subject.id);
    ids.d = await topic("d", 7, subject.id);
    ids.c = await topic("c", 8, subject.id);
    ids.deleted = await topic("ochirilgan", 7, subject.id, new Date());
    ids.noEmbedding = await topic("embeddingsiz", 7, subject.id);
    ids.other = await topic("a", 7, otherSubject.id);

    await setEmbedding("Topic", ids.a!, V_A);
    await setEmbedding("Topic", ids.b!, V_B);
    await setEmbedding("Topic", ids.c!, V_C);
    await setEmbedding("Topic", ids.d!, V_D);
    await setEmbedding("Topic", ids.deleted!, V_A);
    await setEmbedding("Topic", ids.other!, V_A);
    // ids.noEmbedding ATAYLAB NULL qoladi.

    const chunk = async (topicId: string, sourceRef: string) =>
      (
        await db.sourceChunk.create({
          data: { topicId, sourceRef, content: `matn ${sourceRef}` },
          select: { id: true },
        })
      ).id;

    ids.chunkNear = await chunk(ids.a!, "yaqin");
    ids.chunkFar = await chunk(ids.a!, "uzoq");
    ids.chunkOnDeletedTopic = await chunk(ids.deleted!, "ochirilgan-mavzuda");
    ids.chunkNoEmbedding = await chunk(ids.b!, "embeddingsiz");

    await setEmbedding("SourceChunk", ids.chunkNear!, V_A);
    await setEmbedding("SourceChunk", ids.chunkFar!, V_C);
    await setEmbedding("SourceChunk", ids.chunkOnDeletedTopic!, V_A);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await purge(db);
    await db.$disconnect();
  }, 60_000);

  describe("findSimilarTopics", () => {
    it("cosine o'xshashligi bo'yicha saralaydi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.subject, db });

      expect(found.map((row) => row.slug)).toEqual(["a", "b", "c", "d"]);
      expect(found[0]?.similarity).toBeCloseTo(1, 5);
      expect(found[1]?.similarity).toBeCloseTo(Math.SQRT1_2, 5);
      expect(found[2]?.similarity).toBeCloseTo(1 / Math.sqrt(10), 5);
      // Perpendikulyar vektor — o'xshashlik 0, lekin baribir qaytadi
      // (chegara qo'yish chaqiruvchining ishi).
      expect(found[3]?.similarity).toBeCloseTo(0, 5);
    });

    it("o'chirilgan mavzu chiqmaydi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.subject, db });

      expect(found.map((row) => row.id)).not.toContain(ids.deleted);
    });

    it("embedding'i yo'q mavzu chiqmaydi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.subject, db });

      expect(found.map((row) => row.id)).not.toContain(ids.noEmbedding);
    });

    it("subjectId filtri boshqa fanni kesadi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.otherSubject, db });

      expect(found.map((row) => row.id)).toEqual([ids.other]);
    });

    it("grade filtri ishlaydi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.subject, grade: 8, db });

      expect(found.map((row) => row.slug)).toEqual(["c"]);
    });

    it("limit hurmat qilinadi", async () => {
      const found = await findSimilarTopics(QUERY, { subjectId: ids.subject, limit: 2, db });

      expect(found.map((row) => row.slug)).toEqual(["a", "b"]);
    });

    it("noto'g'ri o'lchamli embedding — tushunarli xato, so'rov yuborilmaydi", async () => {
      await expect(findSimilarTopics([1, 2, 3], { db })).rejects.toThrow(/768/);
    });
  });

  describe("findSimilarChunks", () => {
    it("topicId bo'yicha saralab qaytaradi", async () => {
      const found = await findSimilarChunks(QUERY, { topicId: ids.a, db });

      expect(found.map((row) => row.sourceRef)).toEqual(["yaqin", "uzoq"]);
      expect(found[0]?.content).toBe("matn yaqin");
    });

    it("embedding'i yo'q bo'lak chiqmaydi", async () => {
      const found = await findSimilarChunks(QUERY, { topicId: ids.b, db });

      expect(found).toEqual([]);
    });

    it("o'chirilgan mavzuning bo'laklari chiqmaydi", async () => {
      const found = await findSimilarChunks(QUERY, { db, limit: 100 });

      expect(found.map((row) => row.id)).not.toContain(ids.chunkOnDeletedTopic);
    });
  });
});
