import { embedTexts, EMBEDDING_MODEL, type LlmCallDb } from "@/lib/llm";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { EMBEDDING_DIM } from "./search";

/**
 * Mavzu embeddinglarini yozadigan YAGONA joy.
 *
 * NEGA HAMMASI RAW SQL: `Topic.embedding` — `Unsupported("vector(768)")`,
 * Prisma Client uni o'qiy ham, yoza ham olmaydi. Demak filtrlar ham
 * QO'LDA yoziladi — Prisma'ning `where` mantig'i bu so'rovlarga tegmaydi.
 * Ayniqsa `"deletedAt" IS NULL`: uni unutish o'chirilgan mavzuga vektor
 * yozadi va uni qidiruvda qayta paydo qiladi.
 *
 * XAVFSIZLIK: barcha qiymatlar tagged template (`Prisma.sql`) orqali
 * PARAMETR sifatida uzatiladi — satr birikmasi yo'q, SQL injection yo'q.
 *
 * TRANZAKSIYA QOIDASI: `embedTopics()` — TARMOQ chaqiruvi, u tranzaksiya
 * ichida chaqirilmaydi. Tranzaksiya faqat `writeTopicVectors()` ni o'raydi.
 * Sababi o'sha funksiyalar ustidagi izohlarda.
 */

/** Joriy model — provenance ustuniga aynan shu yoziladi. */
export const EMBEDDING_MODEL_ID = EMBEDDING_MODEL.id;

export type StaleTopic = {
  id: string;
  titleUz: string;
  objectives: string[];
  keywords: string[];
};

/** `embeddedAt < updatedAt` taqqoslashi uchun kerak bo'lgan provenance. */
export type TopicProvenance = {
  embeddedAt: Date | null;
  embeddingModel: string | null;
  updatedAt: Date;
};

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/**
 * Vektorga beriladigan matn.
 *
 * BU FORMAT O'ZGARSA — BARCHA VEKTOR ESKIRADI, lekin `embeddingModel`
 * o'zgarmagani uchun eskirish sharti buni SEZMAYDI. Shunday o'zgarish
 * kiritilsa `pnpm embed:backfill --force` bilan hammasini qayta yozish
 * kerak (yoki `EMBEDDING_MODEL_ID` ga versiya qo'shish).
 */
export function topicEmbeddingText(
  t: Pick<StaleTopic, "titleUz" | "objectives" | "keywords">,
): string {
  return [t.titleUz, t.objectives.join("\n"), t.keywords.join(", ")].join("\n");
}

/**
 * Vektor eskirganmi — SOF funksiya.
 *
 * `findStaleTopics()` dagi SQL sharti bilan AYNAN bir xil bo'lishi kerak.
 * Bitta shart ikki tilda yozilgani — siljish xavfi, shuning uchun bu
 * funksiya spetsifikatsiya rolini o'ynaydi (`tests/embeddings-staleness`)
 * va integratsiya testi ikkalasini haqiqiy qatorlarda solishtiradi.
 */
export function isTopicStale(row: TopicProvenance, model: string): boolean {
  if (row.embeddedAt === null) return true;
  if (row.embeddingModel !== model) return true;
  return row.embeddedAt.getTime() < row.updatedAt.getTime();
}

/**
 * Vektor yozilishi kerak bo'lgan mavzular.
 *
 * `ORDER BY "grade", "order"` — progress chiqishi tushunarli bo'lsin
 * (tasodifiy tartibda "96 ta yozildi" hech narsa aytmaydi).
 */
export async function findStaleTopics(
  db: Db,
  opts: { subjectSlug?: string; grade?: number; force?: boolean; limit: number },
): Promise<StaleTopic[]> {
  const filters: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];

  if (opts.subjectSlug !== undefined) {
    filters.push(
      Prisma.sql`"subjectId" = (SELECT "id" FROM "Subject" WHERE "slug" = ${opts.subjectSlug})`,
    );
  }
  if (opts.grade !== undefined) filters.push(Prisma.sql`"grade" = ${opts.grade}`);

  // `--force` — provenance'ga qaramay hammasini qayta yozish. Matn formati
  // o'zgargandagi yagona yo'l (`topicEmbeddingText` izohiga qarang).
  if (!opts.force) {
    filters.push(Prisma.sql`(
      "embeddedAt" IS NULL
      OR "embeddingModel" IS DISTINCT FROM ${EMBEDDING_MODEL_ID}
      OR "embeddedAt" < "updatedAt"
    )`);
  }

  return db.$queryRaw<StaleTopic[]>`
    SELECT "id", "titleUz", "objectives", "keywords"
    FROM "Topic"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY "grade", "order"
    LIMIT ${opts.limit}
  `;
}

/** Eskirgan mavzular soni — progress va cron javobi uchun. */
export async function countStaleTopics(
  db: Db,
  opts: { subjectSlug?: string; grade?: number; force?: boolean },
): Promise<number> {
  // Sanoq va tanlovning sharti bir xil bo'lishi kerak, shuning uchun
  // shartni takrorlamasdan o'sha so'rovni ishlatamiz. Jadval kichik
  // (fan×sinf bo'yicha yuzlab qator), shuning uchun bu arzon.
  const rows = await findStaleTopics(db, { ...opts, limit: 10_000 });
  return rows.length;
}

/**
 * Matnlardan vektor yasaydi — TARMOQ CHAQIRUVI.
 *
 * `$transaction` ICHIDA CHAQIRILMASIN: Prisma interaktiv tranzaksiyasi
 * sukut bo'yicha 5 s da uziladi (P2028) va `lib/db.ts` da
 * `transactionOptions` yo'q — 96 ta matnli Gemini chaqiruvi bemalol oshadi.
 * Bundan ham muhimi, xarajat jurnali ham o'sha `tx` bilan yozilardi, ya'ni
 * partiya yiqilsa rollback `errorKind` qatorini ham o'chirib, xato sababini
 * yo'q qilardi.
 */
export async function embedTopics(
  topics: StaleTopic[],
  opts: { userId?: string | null; db?: LlmCallDb } = {},
): Promise<number[][]> {
  const texts = topics.map(topicEmbeddingText);
  return embedTexts(texts, {
    userId: opts.userId ?? null,
    purpose: "embed-topic",
    db: opts.db,
  });
}

/**
 * Vektorlarni bazaga yozadi — tranzaksiyaga o'raladigan yagona qism.
 *
 * Yozilgan qator sonini qaytaradi. Bu son `topics.length` dan KAM bo'lishi
 * mumkin: so'rov bilan yozuv orasida mavzu o'chirilgan bo'lsa
 * `"deletedAt" IS NULL` sharti uni chetlab o'tadi. Chaqiruvchi shu sonni
 * tekshirishi SHART — aks holda o'sha partiya qayta-qayta tanlanib,
 * cheksiz aylanma va bekorga sarflangan pul bo'ladi.
 */
export async function writeTopicVectors(
  db: Db,
  topics: StaleTopic[],
  vectors: number[][],
): Promise<number> {
  if (topics.length !== vectors.length) {
    throw new Error(
      `Mavzu va vektor soni mos emas: ${topics.length} / ${vectors.length}`,
    );
  }

  let written = 0;
  for (const [i, topic] of topics.entries()) {
    const vector = vectors[i]!;
    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding o'lchami ${EMBEDDING_DIM} bo'lishi kerak (topildi: ${vector.length}).`,
      );
    }

    // NEGA `GREATEST(NOW(), "updatedAt")` — IKKI SOAT MUAMMOSI:
    // `updatedAt` ni Prisma KLIENT tomonda qo'yadi (`@updatedAt` — bu
    // Prisma'ning o'zi yuboradigan qiymat, baza funksiyasi emas), `NOW()`
    // esa Postgres soatidan keladi. Klient soati bazadan oldinda bo'lsa
    // (odatiy hol: mahalliy mashina bir necha soniya farq qiladi) yangi
    // yozilgan qator DARHOL `embeddedAt < updatedAt` shartiga tushib,
    // "eskirgan" bo'lib qolardi — cron uni har kuni qayta yozib, bekorga
    // pul sarflardi. Bu beqaror (flaky) nosozlik: farq kichik bo'lsa
    // sezilmaydi, katta bo'lsa cheksiz qayta yozish.
    //
    // `GREATEST` semantikani BUZMAYDI: yozuvdan KEYINGI tahrir `updatedAt`
    // ni yangilaydi va qator baribir eskiradi. `isTopicStale()` ga tegish
    // kerak emas.
    written += await db.$executeRaw`
      UPDATE "Topic"
      SET "embedding" = ${JSON.stringify(vector)}::vector,
          "embeddingModel" = ${EMBEDDING_MODEL_ID},
          "embeddedAt" = GREATEST(NOW(), "updatedAt")
      WHERE "id" = ${topic.id} AND "deletedAt" IS NULL
    `;
  }

  return written;
}
