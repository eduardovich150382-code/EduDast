import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  embedTopics,
  EMBEDDING_MODEL_ID,
  findStaleTopics,
  isTopicStale,
  writeTopicVectors,
  type StaleTopic,
} from "@/lib/curriculum/embed";
import { EMBEDDING_DIM, findSimilarTopics, searchTopics } from "@/lib/curriculum/search";
import { setEmbeddingProvider } from "@/lib/llm/embeddings";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { EmbeddingProvider } from "@/lib/llm/types";

/**
 * lib/curriculum/embed.ts — HAQIQIY Postgres kerak (pgvector, `::vector`,
 * `NOW()`, HNSW indeksi).
 *
 * ENG MUHIM MAQSAD: `isTopicStale()` (TypeScript) va `findStaleTopics()`
 * (SQL) bitta shartning ikki tildagi yozilishi. Bu test ularni HAQIQIY
 * qatorlarda solishtiradi — siljish boshqa yo'l bilan sezilmaydi.
 *
 * BAZA XAVFSIZLIGI `tests/integration/curriculum-search.test.ts` dagidek:
 * faqat `TEST_DATABASE_URL`, asosiy baza bilan bir xil bo'lsa ataylab
 * yiqiladi, `lib/db.ts` singleton'i import qilinmaydi.
 *
 * PROVAYDER SOXTA: bu test pgvector yo'lini tekshiradi, Gemini'ni emas.
 * Jonli embedding `pnpm llm:smoke` da tekshiriladi.
 */

const TEST_URL = process.env.TEST_DATABASE_URL;

const PREFIX = "test-embed-";
const runId = `${PREFIX}${Date.now()}`;

/** Nol bo'lmagan vektor — `l2Normalize` nol vektorni rad etadi. */
function vec(first: number, second: number): number[] {
  const values = new Array<number>(EMBEDDING_DIM).fill(0.0001);
  values[0] = first;
  values[1] = second;
  return values;
}

/**
 * Soxta provayder: matn uzunligidan vektor yasaydi. Tartib buzilsa
 * `findSimilarTopics` boshqa mavzuni birinchi qaytaradi.
 */
function fakeProvider(): EmbeddingProvider {
  return {
    id: "fake-embed",
    model: EMBEDDING_MODEL_ID,
    dim: EMBEDDING_DIM,
    async embed(texts) {
      return {
        vectors: texts.map((t) => vec(1, t.length / 100)),
        usage: { tokensIn: 10, tokensOut: 0, cacheRead: 0, cacheWrite: 0 },
      };
    },
  };
}

let db: PrismaClient;
let subjectId: string;

async function purge(client: PrismaClient): Promise<void> {
  const subjects = await client.subject.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  const subjectIds = subjects.map((s) => s.id);
  if (subjectIds.length === 0) return;

  // Sxemada onDelete: Cascade yo'q — tartib qo'lda. HARD delete: test
  // artefakti, soft delete qoidasi unga tegishli emas.
  await client.llmCall.deleteMany({ where: { purpose: "embed-topic", userId: null } });
  await client.sourceChunk.deleteMany({ where: { topic: { subjectId: { in: subjectIds } } } });
  await client.topic.deleteMany({ where: { subjectId: { in: subjectIds } } });
  await client.subject.deleteMany({ where: { id: { in: subjectIds } } });
}

describe.skipIf(!TEST_URL)("embedding yozuvchisi (pgvector)", () => {
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
      WHERE "table_name" = 'Topic' AND "column_name" IN ('embeddedAt', 'embeddingModel', 'updatedAt')
    `;
    if (columns.length < 3) {
      throw new Error(
        "Test bazasida embedding provenance ustunlari yo'q. Test branch'ga migratsiyalarni " +
          'qo\'llang: DATABASE_URL="<branch URL>" pnpm prisma migrate deploy',
      );
    }

    await purge(db);
    const subject = await db.subject.create({
      data: { slug: runId, nameUz: "Test", nameUzCyrl: "Тест", nameRu: "Тест" },
    });
    subjectId = subject.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await purge(db);
    await db.$disconnect();
    setEmbeddingProvider(null);
  }, 60_000);

  beforeEach(async () => {
    setEmbeddingProvider(fakeProvider());
    await db.topic.deleteMany({ where: { subjectId } });
  });

  /** Mavzu yaratadi va `StaleTopic` shaklida qaytaradi. */
  async function makeTopic(
    slug: string,
    overrides: Partial<{ titleUz: string; keywords: string[]; grade: number; order: number }> = {},
  ): Promise<StaleTopic> {
    const row = await db.topic.create({
      data: {
        subjectId,
        grade: overrides.grade ?? 7,
        slug,
        titleUz: overrides.titleUz ?? `Mavzu ${slug}`,
        titleUzCyrl: "Мавзу",
        titleRu: "Тема",
        order: overrides.order ?? 1,
        objectives: ["Maqsad"],
        keywords: overrides.keywords ?? ["kalit"],
      },
      select: { id: true, titleUz: true, objectives: true, keywords: true },
    });
    return row;
  }

  /** Provenance ustunlarini o'qiydi. */
  async function provenance(id: string) {
    const row = await db.topic.findUniqueOrThrow({
      where: { id },
      select: { embeddedAt: true, embeddingModel: true, updatedAt: true },
    });
    return row;
  }

  /**
   * `updatedAt` ni to'g'ridan-to'g'ri yozadi — klient soati bazadan
   * oldinda bo'lgan holatni takrorlash uchun.
   */
  async function setUpdatedAt(id: string, at: Date): Promise<void> {
    await db.$executeRaw`UPDATE "Topic" SET "updatedAt" = ${at} WHERE "id" = ${id}`;
  }

  /** Vektor yozilganmi — `embedding` ustuni `Unsupported`, raw SQL kerak. */
  async function hasVector(id: string): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT ("embedding" IS NOT NULL) AS "ok" FROM "Topic" WHERE "id" = ${id}
    `;
    return rows[0]?.ok === true;
  }

  it("vektor yoziladi va findSimilarTopics uni qaytaradi", async () => {
    const topic = await makeTopic("a", { titleUz: "Mexanik harakat" });

    const vectors = await embedTopics([topic], { userId: null, db });
    const written = await writeTopicVectors(db, [topic], vectors);

    expect(written).toBe(1);
    expect(await hasVector(topic.id)).toBe(true);

    const matches = await findSimilarTopics(vectors[0]!, { subjectId, db });
    expect(matches.map((m) => m.id)).toContain(topic.id);
    // O'ziga o'xshashlik 1 ga juda yaqin bo'lishi kerak.
    expect(matches[0]!.similarity).toBeCloseTo(1, 5);
  });

  it("provenance to'ldiriladi (embeddingModel va embeddedAt)", async () => {
    const topic = await makeTopic("b");

    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);

    const row = await provenance(topic.id);
    expect(row.embeddingModel).toBe(EMBEDDING_MODEL_ID);
    expect(row.embeddedAt).toBeInstanceOf(Date);
  });

  it("yozilgandan keyin eskirgan HISOBLANMAYDI", async () => {
    const topic = await makeTopic("c");

    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);

    const row = await provenance(topic.id);
    expect(isTopicStale(row, EMBEDDING_MODEL_ID)).toBe(false);
    expect(row.embeddedAt!.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
  });

  /**
   * IKKI SOAT MUAMMOSI — aniq holat, tasodifiy vaqtga tayanmaydi.
   *
   * `updatedAt` ni Prisma KLIENT tomonda qo'yadi, `embeddedAt` esa
   * Postgres `NOW()` dan keladi. Klient soati bazadan oldinda bo'lsa yangi
   * yozilgan qator darhol "eskirgan" bo'lib qolardi va cron uni har kuni
   * qayta yozib, bekorga pul sarflardi.
   *
   * Yuqoridagi ikki test buni faqat TASODIFAN ushlaydi (soat farqi va
   * testning tezligiga qarab), shuning uchun bu yerda `updatedAt` ni
   * ataylab 10 soniya KELAJAKKA qo'yamiz — `GREATEST(NOW(), "updatedAt")`
   * bo'lmasa bu test har doim yiqiladi.
   */
  it("updatedAt kelajakda bo'lsa ham yozilgandan keyin eskirmaydi", async () => {
    const topic = await makeTopic("clock-skew");
    const future = new Date(Date.now() + 10_000);

    // RAW SQL ataylab: `@updatedAt` ustuniga Prisma orqali qiymat berish
    // ishonchsiz (u avtomatik qiymatni yozadi). Klient soati bazadan 10
    // soniya oldinda bo'lgan holatni aynan takrorlash uchun ustunni to'g'ri
    // yozamiz.
    await setUpdatedAt(topic.id, future);

    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);

    const row = await provenance(topic.id);
    expect(row.updatedAt.getTime()).toBe(future.getTime());
    expect(row.embeddedAt!.getTime()).toBeGreaterThanOrEqual(future.getTime());
    expect(isTopicStale(row, EMBEDDING_MODEL_ID)).toBe(false);

    // SQL tomoni ham shu fikrda bo'lishi kerak.
    const stale = await findStaleTopics(db, { subjectSlug: runId, limit: 100 });
    expect(stale.map((t) => t.id)).not.toContain(topic.id);
  });

  /**
   * `GREATEST` semantikani buzmasligi: yozuvdan KEYINGI tahrir qatorni
   * baribir eskiradi. Bu `isTopicStale()` ga tegmaganimizning isboti.
   */
  it("GREATEST dan keyin ham keyingi tahrir qatorni eskiradi", async () => {
    const topic = await makeTopic("clock-skew-2");
    await setUpdatedAt(topic.id, new Date(Date.now() + 10_000));

    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);
    expect(isTopicStale(await provenance(topic.id), EMBEDDING_MODEL_ID)).toBe(false);

    // Yozuvdan keyingi tahrir — `updatedAt` yana oldinga suriladi.
    await setUpdatedAt(topic.id, new Date(Date.now() + 20_000));

    expect(isTopicStale(await provenance(topic.id), EMBEDDING_MODEL_ID)).toBe(true);
  });

  it("SQL va isTopicStale bir xil qatorlarni tanlaydi", async () => {
    const fresh = await makeTopic("stale-1");
    const never = await makeTopic("stale-2");
    const otherModel = await makeTopic("stale-3");

    const vectors = await embedTopics([fresh, otherModel], { userId: null, db });
    await writeTopicVectors(db, [fresh], [vectors[0]!]);
    await writeTopicVectors(db, [otherModel], [vectors[1]!]);
    // Boshqa model bilan yozilgan qatorni qo'lda belgilaymiz.
    await db.topic.update({
      where: { id: otherModel.id },
      data: { embeddingModel: "gemini-embedding-2" },
    });

    const sqlIds = (await findStaleTopics(db, { subjectSlug: runId, limit: 100 })).map((t) => t.id);

    const all = await db.topic.findMany({
      where: { subjectId },
      select: { id: true, embeddedAt: true, embeddingModel: true, updatedAt: true },
    });
    const tsIds = all.filter((r) => isTopicStale(r, EMBEDDING_MODEL_ID)).map((r) => r.id);

    expect([...sqlIds].sort()).toEqual([...tsIds].sort());
    expect(sqlIds).toContain(never.id);
    expect(sqlIds).toContain(otherModel.id);
    expect(sqlIds).not.toContain(fresh.id);
  });

  it("tahrirdan keyin eskirgan bo'lib qoladi (embeddedAt < updatedAt)", async () => {
    const topic = await makeTopic("d");
    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);

    // `updateTopic` server action'i aynan shunday qiladi: `embeddedAt: null`.
    // Bu yerda esa faqat matnni o'zgartirib, `@updatedAt` ning o'zi
    // yetarliligini tekshiramiz.
    await db.topic.update({ where: { id: topic.id }, data: { titleUz: "Yangi sarlavha" } });

    const row = await provenance(topic.id);
    expect(isTopicStale(row, EMBEDDING_MODEL_ID)).toBe(true);

    const stale = await findStaleTopics(db, { subjectSlug: runId, limit: 100 });
    expect(stale.map((t) => t.id)).toContain(topic.id);
  });

  it("o'chirilgan mavzuga vektor YOZILMAYDI", async () => {
    const topic = await makeTopic("deleted");
    const vectors = await embedTopics([topic], { userId: null, db });

    await db.topic.update({ where: { id: topic.id }, data: { deletedAt: new Date() } });

    // Bu — cheksiz aylanma qalqonining sababi: 0 qaytadi, chaqiruvchi
    // to'xtashi kerak.
    const written = await writeTopicVectors(db, [topic], vectors);

    expect(written).toBe(0);
    expect(await hasVector(topic.id)).toBe(false);
  });

  it("o'chirilgan mavzu eskirganlar ro'yxatiga TUSHMAYDI", async () => {
    const topic = await makeTopic("deleted-2");
    await db.topic.update({ where: { id: topic.id }, data: { deletedAt: new Date() } });

    const stale = await findStaleTopics(db, { subjectSlug: runId, limit: 100 });

    expect(stale.map((t) => t.id)).not.toContain(topic.id);
  });

  it("--force provenance'ga qaramay hammasini tanlaydi", async () => {
    const topic = await makeTopic("forced");
    const vectors = await embedTopics([topic], { userId: null, db });
    await writeTopicVectors(db, [topic], vectors);

    expect(await findStaleTopics(db, { subjectSlug: runId, limit: 100 })).toHaveLength(0);
    expect(
      await findStaleTopics(db, { subjectSlug: runId, force: true, limit: 100 }),
    ).toHaveLength(1);
  });

  it("subject va grade filtrlari ishlaydi", async () => {
    await makeTopic("g7", { grade: 7 });
    await makeTopic("g8", { grade: 8 });

    const g7 = await findStaleTopics(db, { subjectSlug: runId, grade: 7, limit: 100 });
    const all = await findStaleTopics(db, { subjectSlug: runId, limit: 100 });
    const nobody = await findStaleTopics(db, { subjectSlug: "yoq-fan", limit: 100 });

    expect(g7).toHaveLength(1);
    expect(all).toHaveLength(2);
    expect(nobody).toHaveLength(0);
  });

  it("mavzu va vektor soni mos kelmasa rad etadi", async () => {
    const topic = await makeTopic("mismatch");

    await expect(writeTopicVectors(db, [topic], [])).rejects.toThrow(/soni mos emas/);
  });

  /**
   * HNSW indekslari faqat migratsiya fayllarida yashaydi — Prisma
   * `Unsupported` ustunga `@@index` yoza olmaydi va ularni HAR
   * `migrate dev` da DROP qiladi (2026-09-26 da aynan shu yuz berdi).
   * Indeks yo'qolgani XATO BERMAYDI, qidiruv shunchaki to'liq skanga
   * tushadi — shuning uchun bu jim sekinlashish shu test bilan qizil
   * bo'ladi.
   */
  it("HNSW indekslari joyida turadi", async () => {
    const rows = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT "indexname"::text FROM pg_indexes
      WHERE "indexname" IN ('Topic_embedding_hnsw_idx', 'SourceChunk_embedding_hnsw_idx')
    `;

    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "SourceChunk_embedding_hnsw_idx",
      "Topic_embedding_hnsw_idx",
    ]);
  });
});

describe.skipIf(!TEST_URL)("qidiruv degradatsiyasi", () => {
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: TEST_URL }) });
    await purge(db);
    const subject = await db.subject.create({
      data: {
        slug: `${runId}-search`,
        nameUz: "Test",
        nameUzCyrl: "Тест",
        nameRu: "Тест",
      },
    });
    subjectId = subject.id;

    await db.topic.create({
      data: {
        subjectId,
        grade: 7,
        slug: "tezlik",
        titleUz: "Mexanik harakat va tezlik",
        titleUzCyrl: "Механик ҳаракат",
        titleRu: "Механическое движение",
        order: 1,
        objectives: ["Tezlikni hisoblash"],
        keywords: ["tezlik", "harakat"],
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await purge(db);
    await db.$disconnect();
    vi.restoreAllMocks();
  }, 60_000);

  /**
   * Embedding ishlamasa RAG YIQILMASLIGI kerak — sifati pasayadi.
   * `mode: "keyword"` qaytgani uchun pasayish yashirin qolmaydi.
   */
  it("embedding yiqilsa kalit so'z qidiruviga tushadi", async () => {
    // Kalitni olib tashlaymiz: `geminiEmbeddings` `not_configured` tashlaydi.
    setEmbeddingProvider(null);
    vi.stubEnv("GOOGLE_API_KEY", "");
    const { resetGeminiClient } = await import("@/lib/llm/providers/gemini");
    resetGeminiClient();

    const result = await searchTopics("tezlik", { subjectId, db });

    expect(result.mode).toBe("keyword");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.titleUz).toBe("Mexanik harakat va tezlik");

    vi.unstubAllEnvs();
    resetGeminiClient();
  });

  it("kalit so'z sarlavha bo'yicha ham topadi", async () => {
    const { findTopicsByKeyword } = await import("@/lib/curriculum/search");

    expect(await findTopicsByKeyword("Mexanik", { subjectId, db })).toHaveLength(1);
    expect(await findTopicsByKeyword("harakat", { subjectId, db })).toHaveLength(1);
    expect(await findTopicsByKeyword("kimyo", { subjectId, db })).toHaveLength(0);
    expect(await findTopicsByKeyword("   ", { subjectId, db })).toHaveLength(0);
  });
});
