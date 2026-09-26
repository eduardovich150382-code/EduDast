import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocumentNotRunning, InsufficientCredits, isCreditError } from "@/lib/credits/errors";
import { charge, hold, release } from "@/lib/credits/ledger";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * lib/credits/ledger.ts — HAQIQIY Postgres kerak.
 *
 * ENG MUHIM MAQSAD: `hold()` ning poygaga chidamliligi. Uni mock bilan
 * tekshirish MUMKIN EMAS — kafolat Postgres qator qulfida, ya'ni
 * `UPDATE ... WHERE "creditBalance" - "creditsHeld" >= $n` shartini
 * qulflangan qator ustida qayta baholashida. O'qib-keyin-yozadigan kod mock
 * testlaridan bemalol o'tadi va prodda balansni manfiyga tushiradi.
 *
 * BAZA XAVFSIZLIGI `tests/integration/embeddings-write.test.ts` dagidek:
 * faqat `TEST_DATABASE_URL`, asosiy baza bilan bir xil bo'lsa ataylab
 * yiqiladi, `lib/db.ts` singleton'i import QILINMAYDI (daftar `db` ni
 * parametr sifatida oladi — aynan shu uchun).
 */

const TEST_URL = process.env.TEST_DATABASE_URL;

const PREFIX = "test-credits-";
const runId = `${PREFIX}${Date.now()}`;

let db: PrismaClient;
let topicId: string;

/**
 * Test artefaktlarini o'chiradi. Sxemada `onDelete: Cascade` yo'q — tartib
 * qo'lda: `CreditTx` → `Document` → `User` → `Topic` → `Subject`.
 * HARD delete: test artefakti, soft delete qoidasi unga tegishli emas.
 */
async function purge(client: PrismaClient): Promise<void> {
  const users = await client.user.findMany({
    where: { fullName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await client.creditTx.deleteMany({ where: { userId: { in: userIds } } });
    await client.document.deleteMany({ where: { userId: { in: userIds } } });
    await client.user.deleteMany({ where: { id: { in: userIds } } });
  }

  const subjects = await client.subject.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  const subjectIds = subjects.map((s) => s.id);
  if (subjectIds.length > 0) {
    await client.topic.deleteMany({ where: { subjectId: { in: subjectIds } } });
    await client.subject.deleteMany({ where: { id: { in: subjectIds } } });
  }
}

/** Har test o'z foydalanuvchisini oladi — balanslar aralashmasin. */
let seq = 0;
async function makeUser(creditBalance: number, opts: { deleted?: boolean } = {}) {
  seq += 1;
  return db.user.create({
    data: {
      // `telegramId` unique — vaqt va hisoblagich bilan to'qnashmaydi.
      // `BigInt(...)` chaqiruvi, `1000n` literali EMAS: tsconfig `target`
      // ES2017 (BigInt literali ES2020 dan boshlab) — `tests/telegram-auth.test.ts`
      // ham shu sababdan `BigInt("...")` ishlatadi.
      telegramId: BigInt(Date.now()) * BigInt(1000) + BigInt(seq),
      fullName: `${runId}-u${seq}`,
      creditBalance,
      deletedAt: opts.deleted ? new Date() : null,
    },
  });
}

/**
 * `Document.topicId` majburiy FK, `inputParams` / `contentJson` — `Json`
 * default'siz. Shuning uchun fikstura to'liq yaratiladi, aks holda baza
 * yozuvni rad etadi.
 */
async function makeDocument(userId: string, status: "QUEUED" | "RUNNING" | "DONE" | "FAILED") {
  return db.document.create({
    data: {
      userId,
      topicId,
      type: "LESSON_PLAN",
      title: `${runId}-doc`,
      status,
      inputParams: {},
      contentJson: {},
    },
  });
}

describe.skipIf(!TEST_URL)("kredit daftari (Postgres qator qulfi)", () => {
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
      WHERE ("table_name" = 'User' AND "column_name" = 'creditsHeld')
         OR ("table_name" = 'Document' AND "column_name" IN ('startedAt', 'failReason', 'creditsHeldFor'))
    `;
    if (columns.length < 4) {
      throw new Error(
        "Test bazasida credits_hold ustunlari yo'q. Test branch'ga migratsiyalarni qo'llang: " +
          'DIRECT_URL="<branch direct URL>" pnpm prisma migrate deploy (migrate dev EMAS)',
      );
    }

    await purge(db);
    const subject = await db.subject.create({
      data: { slug: runId, nameUz: "Test", nameUzCyrl: "Тест", nameRu: "Тест" },
    });
    const topic = await db.topic.create({
      data: {
        subjectId: subject.id,
        grade: 7,
        slug: `${runId}-topic`,
        titleUz: "Test mavzu",
        titleUzCyrl: "Тест мавзу",
        titleRu: "Тестовая тема",
        order: 1,
      },
    });
    topicId = topic.id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await purge(db);
    await db.$disconnect();
  }, 60_000);

  it(
    "balans 7 ga 20 ta parallel hold(1) — aniq 7 tasi o'tadi",
    async () => {
      const user = await makeUser(7);

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => hold(user.id, 1, `${runId}-doc-${i}`, { db })),
      );

      const passed = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");

      expect(passed).toHaveLength(7);
      expect(failed).toHaveLength(13);
      // Har rad etish AYNAN yetarsiz balans bo'lsin — deadlock yoki
      // serializatsiya xatosi "muvaffaqiyat" deb hisoblanmasin.
      for (const r of failed) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientCredits);
      }

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditsHeld).toBe(7);
      // `creditBalance` TEGILMAYDI: hold faqat band qiladi.
      expect(after.creditBalance).toBe(7);

      // Hold daftarga hech narsa yozmaydi (CLAUDE.md 4-qoida).
      expect(await db.creditTx.count({ where: { userId: user.id } })).toBe(0);
    },
    60_000,
  );

  it(
    "hold → charge: balans kamayadi, bitta CreditTx, hujjat DONE",
    async () => {
      const user = await makeUser(7);
      const doc = await makeDocument(user.id, "RUNNING");

      await hold(user.id, 3, doc.id, { db });
      const balanceAfter = await charge(user.id, 3, doc.id, { db });

      expect(balanceAfter).toBe(4);

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditBalance).toBe(4);
      expect(after.creditsHeld).toBe(0);

      const txs = await db.creditTx.findMany({ where: { userId: user.id } });
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({ delta: -3, reason: "GENERATION", refId: doc.id, balanceAfter: 4 });

      const doneDoc = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(doneDoc.status).toBe("DONE");
      expect(doneDoc.creditsUsed).toBe(3);
    },
    60_000,
  );

  it(
    "ikkinchi charge ishlamaydi va HECH NARSANI o'zgartirmaydi (rollback)",
    async () => {
      const user = await makeUser(10);
      const doc = await makeDocument(user.id, "RUNNING");

      await hold(user.id, 2, doc.id, { db });
      await charge(user.id, 2, doc.id, { db });

      // Ikkinchi urinish: hold yo'q, hujjat DONE. Ikkala darvoza ham
      // yopiladi — qaysi biri birinchi ishga tushsa ham pul qimirlamaydi.
      await expect(charge(user.id, 2, doc.id, { db })).rejects.toSatisfy(isCreditError);

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditBalance).toBe(8);
      expect(after.creditsHeld).toBe(0);
      expect(await db.creditTx.count({ where: { userId: user.id } })).toBe(1);
    },
    60_000,
  );

  it(
    "release bandni bo'shatadi, CreditTx yozmaydi, hujjat FAILED",
    async () => {
      const user = await makeUser(5);
      const doc = await makeDocument(user.id, "RUNNING");

      await hold(user.id, 4, doc.id, { db });
      await release(user.id, 4, doc.id, "gemini 503", { db });

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditBalance).toBe(5); // pul qimirlamadi
      expect(after.creditsHeld).toBe(0);
      expect(await db.creditTx.count({ where: { userId: user.id } })).toBe(0);

      const failed = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(failed.status).toBe("FAILED");
      expect(failed.failReason).toBe("gemini 503");
    },
    60_000,
  );

  it(
    "allaqachon FAILED hujjat ustidan release — throw va band o'zgarmaydi",
    async () => {
      const user = await makeUser(5);
      const doc = await makeDocument(user.id, "FAILED");

      await hold(user.id, 4, doc.id, { db });

      await expect(release(user.id, 4, doc.id, "ikkinchi", { db })).rejects.toThrow(
        DocumentNotRunning,
      );

      // Rollback: band HALI HAM turadi. Bu `release()` kontraktining narxi —
      // chaqiruvchi statusni oldin o'zgartirmasligi shuning uchun muhim.
      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditsHeld).toBe(4);
    },
    60_000,
  );

  it(
    "o'chirilgan foydalanuvchi: hold rad etiladi, release esa ishlaydi",
    async () => {
      const user = await makeUser(100, { deleted: true });
      const doc = await makeDocument(user.id, "RUNNING");

      // `deletedAt IS NULL` — balansi katta bo'lsa ham o'chirilgan hisobdan
      // pul band qilinmaydi.
      await expect(hold(user.id, 1, doc.id, { db })).rejects.toThrow(InsufficientCredits);

      // ATAYLAB assimetrik: bandni bo'shatishda `deletedAt` sharti yo'q, aks
      // holda o'chirilgan hisobda abadiy band qolgan kredit yotib qolardi.
      await db.user.update({ where: { id: user.id }, data: { creditsHeld: 1 } });
      await release(user.id, 1, doc.id, "o'chirilgan", { db });

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.creditsHeld).toBe(0);
    },
    60_000,
  );
});
