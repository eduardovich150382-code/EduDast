import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Block } from "@/lib/documents/blocks";
import { claimStage, commitStage, findStaleDocuments } from "@/lib/documents/lifecycle";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { assertTestSchemaCurrent } from "./schema-guard";

/**
 * lib/documents/lifecycle.ts — HAQIQIY Postgres kerak.
 *
 * NEGA MOCK YETMAYDI: bu modulning butun qiymati Postgres semantikasida —
 * `UPDATE` ning qatorni qulflashi va `WHERE` ni qulflangan qator ustida
 * QAYTA baholashi, `jsonb ||` append'i, `NOW()` ning baza soati bo'lishi.
 * Mock bilan yozilgan test SQL satrini emas, o'zimizning taxminimizni
 * tekshirardi (`tests/integration/credits-race.test.ts` bilan bir xil dalil).
 *
 * Baza xavfsizligi o'sha fayldagidek: faqat `TEST_DATABASE_URL`, asosiy
 * baza bilan bir xil bo'lsa ataylab yiqiladi, `lib/db.ts` singleton'i
 * import QILINMAYDI.
 */

const TEST_URL = process.env.TEST_DATABASE_URL;

const PREFIX = "test-lifecycle-";
const runId = `${PREFIX}${Date.now()}`;

let db: PrismaClient;
let userId: string;
let topicId: string;

function blocks(id: string): Block[] {
  return [{ id, type: "paragraph", text: "Bosqich natijasi." }];
}

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

async function makeDocument(
  overrides: { stage?: number; attempts?: number; status?: "QUEUED" | "RUNNING" | "DONE" } = {},
) {
  return db.document.create({
    data: {
      userId,
      topicId,
      type: "LESSON_PLAN",
      title: `${runId}-doc`,
      status: overrides.status ?? "QUEUED",
      creditsHeldFor: 5,
      contentJson: { v: 1, blocks: [] },
      inputParams: {
        durationMinutes: 45,
        contextChunkIds: [],
        progress: {
          stage: overrides.stage ?? 0,
          total: 3,
          attempts: overrides.attempts ?? 0,
        },
      },
    },
  });
}

async function readProgress(id: string) {
  const row = await db.document.findUniqueOrThrow({
    where: { id },
    select: { inputParams: true, contentJson: true, startedAt: true, status: true },
  });
  const params = row.inputParams as {
    progress: { stage: number; total: number; attempts: number };
    skeleton?: unknown;
  };
  const content = row.contentJson as { v: number; blocks: Block[] };
  return { ...row, progress: params.progress, skeleton: params.skeleton, blocks: content.blocks };
}

describe.skipIf(!TEST_URL)("generatsiya bosqichlari (Postgres qator qulfi)", () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_URL) {
      throw new Error(
        "TEST_DATABASE_URL asosiy baza bilan bir xil. Neon'da alohida test branch oching.",
      );
    }

    db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: TEST_URL }) });

    // Sxema darvozasi: baza migratsiyalardan orqada bo'lsa tushunarsiz
    // "column does not exist" emas, aniq xabar va qilinadigan buyruq.
    // 12-sessiyada AYNAN shu faylning `beforeAll` i yiqilgan va vitest
    // uning 19 testini "skipped" deb ko'rsatgan edi.
    await assertTestSchemaCurrent(db);
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

    const user = await db.user.create({
      data: {
        telegramId: BigInt(Date.now()) * BigInt(1000),
        fullName: `${runId}-user`,
        creditBalance: 100,
      },
    });
    userId = user.id;
  });

  afterEachCleanup();

  afterAll(async () => {
    if (!db) return;
    await purge(db);
    await db.$disconnect();
  });

  describe("claimStage", () => {
    it("birinchi urinishni egallaydi va attempts ni 1 qiladi", async () => {
      const doc = await makeDocument();
      const claimed = await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      expect(claimed).not.toBeNull();
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.creditsHeldFor).toBe(5);
      expect(claimed?.topicId).toBe(topicId);

      const after = await readProgress(doc.id);
      expect(after.status).toBe("RUNNING");
      expect(after.startedAt).not.toBeNull();
    });

    it("ikkinchi ketma-ket claim RAD ETILADI (ijara tirik)", async () => {
      const doc = await makeDocument();
      expect(await claimStage(db, { documentId: doc.id, userId, stage: 0 })).not.toBeNull();
      expect(await claimStage(db, { documentId: doc.id, userId, stage: 0 })).toBeNull();
    });

    it("PARALLEL ikki claim — aniq bittasi o'tadi", async () => {
      const doc = await makeDocument();
      const [a, b] = await Promise.all([
        claimStage(db, { documentId: doc.id, userId, stage: 0 }),
        claimStage(db, { documentId: doc.id, userId, stage: 0 }),
      ]);

      // Aynan shu yerda 2x LLM narxi to'lanmasligi hal bo'ladi.
      expect([a, b].filter((x) => x !== null)).toHaveLength(1);
      expect((await readProgress(doc.id)).progress.attempts).toBe(1);
    });

    it("ijara muddati o'tsa qayta egallanadi va attempts oshadi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      // Ijara 90 s. `startedAt` ni orqaga surib, o'lgan ishchini taqlid
      // qilamiz (haqiqiy 90 soniya kutish testni yaroqsiz qilardi).
      await db.$executeRaw`
        UPDATE "Document" SET "startedAt" = NOW() - interval '200 seconds' WHERE "id" = ${doc.id}
      `;

      const again = await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      expect(again?.attempts).toBe(2);
    });

    it("boshqa bosqich raqami bilan claim RAD ETILADI", async () => {
      const doc = await makeDocument({ stage: 0 });
      expect(await claimStage(db, { documentId: doc.id, userId, stage: 1 })).toBeNull();
    });

    it("DONE hujjat claim qilinmaydi", async () => {
      const doc = await makeDocument({ status: "DONE" });
      expect(await claimStage(db, { documentId: doc.id, userId, stage: 0 })).toBeNull();
    });

    it("begona foydalanuvchi claim qila olmaydi", async () => {
      const doc = await makeDocument();
      expect(await claimStage(db, { documentId: doc.id, userId: "boshqa", stage: 0 })).toBeNull();
    });

    it("o'chirilgan hujjat claim qilinmaydi", async () => {
      const doc = await makeDocument();
      await db.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
      expect(await claimStage(db, { documentId: doc.id, userId, stage: 0 })).toBeNull();
    });
  });

  describe("commitStage", () => {
    it("bloklarni qo'shadi va kursorni suradi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      const ok = await commitStage(db, {
        documentId: doc.id,
        userId,
        stage: 0,
        blocks: blocks("s1-paragraph-0"),
      });

      expect(ok).toBe(true);
      const after = await readProgress(doc.id);
      expect(after.progress.stage).toBe(1);
      expect(after.progress.attempts).toBe(0);
      expect(after.blocks.map((b) => b.id)).toEqual(["s1-paragraph-0"]);
    });

    it("KEYINGI BOSQICH DARHOL egallanadi — 90 soniya kutilmaydi", async () => {
      // REGRESSIYA QOROVULI. Ijara sharti sof `startedAt < NOW() - 90s`
      // bo'lsa, `commitStage` dagi `startedAt = NOW()` keyingi bosqichni
      // 90 soniyaga bloklardi va konveyer ~3 daqiqaga cho'zilardi.
      // Shuning uchun shart `attempts = 0` ga tayanadi.
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await commitStage(db, {
        documentId: doc.id,
        userId,
        stage: 0,
        blocks: blocks("s1-paragraph-0"),
      });

      const next = await claimStage(db, { documentId: doc.id, userId, stage: 1 });
      expect(next).not.toBeNull();
      expect(next?.attempts).toBe(1);
    });

    it("bloklar ketma-ket QO'SHILADI, almashmaydi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await commitStage(db, { documentId: doc.id, userId, stage: 0, blocks: blocks("a") });
      await claimStage(db, { documentId: doc.id, userId, stage: 1 });
      await commitStage(db, { documentId: doc.id, userId, stage: 1, blocks: blocks("b") });

      expect((await readProgress(doc.id)).blocks.map((b) => b.id)).toEqual(["a", "b"]);
    });

    it("eskirgan kursorda false qaytaradi va HECH NARSA yozmaydi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await commitStage(db, { documentId: doc.id, userId, stage: 0, blocks: blocks("a") });

      // Ijara tugab, ikkinchi ishchi ayni bosqichni bajarib bo'lgan holat.
      const late = await commitStage(db, {
        documentId: doc.id,
        userId,
        stage: 0,
        blocks: blocks("duplikat"),
      });

      expect(late).toBe(false);
      const after = await readProgress(doc.id);
      expect(after.blocks.map((b) => b.id)).toEqual(["a"]);
      expect(after.progress.stage).toBe(1);
    });

    it("PARALLEL ikki commit — bloklar bir marta yoziladi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      const [a, b] = await Promise.all([
        commitStage(db, { documentId: doc.id, userId, stage: 0, blocks: blocks("x") }),
        commitStage(db, { documentId: doc.id, userId, stage: 0, blocks: blocks("y") }),
      ]);

      expect([a, b].filter(Boolean)).toHaveLength(1);
      const after = await readProgress(doc.id);
      expect(after.blocks).toHaveLength(1);
      expect(after.progress.stage).toBe(1);
    });

    it("progressPatch total ni yangilaydi, stage ni BEKOR QILA OLMAYDI", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await commitStage(db, {
        documentId: doc.id,
        userId,
        stage: 0,
        blocks: blocks("a"),
        // `stage` ataylab noto'g'ri: patch uni bekor qilmasligi kerak.
        progressPatch: { total: 4, stage: 99 },
      });

      const after = await readProgress(doc.id);
      expect(after.progress.total).toBe(4);
      expect(after.progress.stage).toBe(1);
    });

    it("paramsPatch skeletni saqlaydi va progress'ni o'chirmaydi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await commitStage(db, {
        documentId: doc.id,
        userId,
        stage: 0,
        blocks: blocks("a"),
        paramsPatch: { skeleton: { title: "Tezlanish" } },
      });

      const after = await readProgress(doc.id);
      expect(after.skeleton).toEqual({ title: "Tezlanish" });
      expect(after.progress.stage).toBe(1);
      expect(after.progress.total).toBe(3);
    });

    it("haqiqiy bo'lmagan blok bazaga YETIB BORMAYDI", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      await expect(
        commitStage(db, {
          documentId: doc.id,
          userId,
          stage: 0,
          // `text` bo'sh — `DocumentContent.parse` rad etadi.
          blocks: [{ id: "bad", type: "paragraph", text: "" }] as unknown as Block[],
        }),
      ).rejects.toThrow();

      expect((await readProgress(doc.id)).blocks).toHaveLength(0);
    });
  });

  describe("findStaleDocuments", () => {
    it("15 daqiqadan eski RUNNING hujjatni topadi", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await db.$executeRaw`
        UPDATE "Document" SET "startedAt" = NOW() - interval '20 minutes' WHERE "id" = ${doc.id}
      `;

      const stale = await findStaleDocuments(db, { userId, limit: 5 });
      expect(stale.map((d) => d.id)).toContain(doc.id);
      expect(stale.find((d) => d.id === doc.id)?.creditsHeldFor).toBe(5);
    });

    it("yangi RUNNING hujjatga TEGMAYDI", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });

      const stale = await findStaleDocuments(db, { userId, limit: 5 });
      expect(stale.map((d) => d.id)).not.toContain(doc.id);
    });

    it("userId null bo'lsa hamma foydalanuvchini qamraydi (cron)", async () => {
      const doc = await makeDocument();
      await claimStage(db, { documentId: doc.id, userId, stage: 0 });
      await db.$executeRaw`
        UPDATE "Document" SET "startedAt" = NOW() - interval '20 minutes' WHERE "id" = ${doc.id}
      `;

      const stale = await findStaleDocuments(db, { userId: null, limit: 50 });
      expect(stale.map((d) => d.id)).toContain(doc.id);
    });
  });
});

/** Har testdan keyin hujjatlarni tozalaydi — kursorlar aralashmasin. */
function afterEachCleanup(): void {
  beforeEach(async () => {
    if (!db) return;
    await db.document.deleteMany({ where: { userId } });
  });
}
