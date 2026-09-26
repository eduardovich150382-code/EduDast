import { describe, expect, it } from "vitest";
import {
  CreditUserNotFound,
  DocumentNotRunning,
  HoldMismatch,
  InsufficientCredits,
  isCreditError,
} from "@/lib/credits/errors";
import { charge, grant, hold, purchase, release, type CreditDb } from "@/lib/credits/ledger";

/**
 * lib/credits/ledger.ts — CLAUDE.md 4-qoidasining mashinada tekshiriladigan
 * qismi: "kredit faqat generatsiya muvaffaqiyatli tugagach yechiladi".
 *
 * Uslub `tests/budget-spend.test.ts` dan: qo'lda yasalgan fake `db` `opts.db`
 * orqali uzatiladi. `vi.mock("@/lib/db")` KERAK EMAS va ATAYLAB ishlatilmadi —
 * daftar `lib/db.ts` ni faqat dinamik import qiladi, ya'ni `db` berilganda
 * asosiy klient umuman yuklanmaydi.
 *
 * Fake SQL matnini ham yozib oladi: `deletedAt IS NULL` yoki ustunni ustunga
 * solishtirish sharti tushib qolsa hech qanday tur xatosi bo'lmaydi — faqat
 * jimgina pul yo'qoladi. Shuning uchun shartlar matn darajasida tekshiriladi.
 */

type Script = {
  /** `$queryRaw` navbatdagi javoblari (`RETURNING` natijasi). */
  queryRows?: Array<Array<{ creditBalance: number }>>;
  /** `$executeRaw` navbatdagi javoblari (ta'sirlangan qator soni). */
  execRows?: number[];
  /** `document.updateMany` qaytaradigan `count`. */
  docCount?: number;
};

function fakeDb(script: Script = {}) {
  const sql: string[] = [];
  const txCreated: Array<Record<string, unknown>> = [];
  const docUpdates: Array<Record<string, unknown>> = [];
  const txOptions: unknown[] = [];
  let q = 0;
  let e = 0;

  const tx = {
    $queryRaw: (t: TemplateStringsArray) => {
      sql.push(t.raw.join("?"));
      return Promise.resolve(script.queryRows?.[q++] ?? []);
    },
    $executeRaw: (t: TemplateStringsArray) => {
      sql.push(t.raw.join("?"));
      return Promise.resolve(script.execRows?.[e++] ?? 0);
    },
    creditTx: {
      create: (args: { data: Record<string, unknown> }) => {
        txCreated.push(args.data);
        return Promise.resolve({});
      },
    },
    document: {
      updateMany: (args: Record<string, unknown>) => {
        docUpdates.push(args);
        return Promise.resolve({ count: script.docCount ?? 1 });
      },
    },
  };

  const db = {
    ...tx,
    $transaction: (fn: (c: typeof tx) => unknown, options?: unknown) => {
      txOptions.push(options);
      return fn(tx);
    },
  };

  return { db: db as unknown as CreditDb, sql, txCreated, docUpdates, txOptions };
}

const USER = "user-1";
const DOC = "doc-1";

describe("hold", () => {
  it("yetarsiz balansda rad etiladi va daftarga yozmaydi", async () => {
    const f = fakeDb({ execRows: [0] });

    await expect(hold(USER, 3, DOC, { db: f.db })).rejects.toThrow(InsufficientCredits);
    expect(f.txCreated).toEqual([]);
  });

  it("balans yetganda o'tadi va CreditTx YOZMAYDI", async () => {
    const f = fakeDb({ execRows: [1] });

    await expect(hold(USER, 3, DOC, { db: f.db })).resolves.toBeUndefined();
    // Hold daftarga tegmaydi: pul qimirlamadi (4-qoida).
    expect(f.txCreated).toEqual([]);
  });

  /**
   * Bu ikki shart SQL'dan tushib qolsa TypeScript jim turadi, lekin:
   * `deletedAt` yo'q bo'lsa — o'chirilgan hisobdan pul yechiladi;
   * ustun-ustunga sharti yo'q bo'lsa — balans manfiyga tushadi.
   */
  it("SQL da soft delete va ustun-ustunga solishtirish shartlari bor", async () => {
    const f = fakeDb({ execRows: [1] });
    await hold(USER, 1, DOC, { db: f.db });

    const [sql] = f.sql;
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain('"creditBalance" - "creditsHeld" >=');
  });
});

describe("charge", () => {
  it("aniq bitta CreditTx yozadi, balanceAfter RETURNING dan olinadi", async () => {
    // Fake ataylab BOSHQA sonlarni beradi: agar kod `balanceAfter` ni oldingi
    // o'qishdan olsa (lost update), bu test yiqiladi.
    const f = fakeDb({ queryRows: [[{ creditBalance: 12 }]], docCount: 1 });

    const result = await charge(USER, 5, DOC, { db: f.db });

    expect(result).toBe(12);
    expect(f.txCreated).toHaveLength(1);
    expect(f.txCreated[0]).toEqual({
      userId: USER,
      delta: -5,
      reason: "GENERATION",
      refId: DOC,
      balanceAfter: 12,
    });
  });

  it("hujjatni DONE qiladi va creditsUsed yozadi", async () => {
    const f = fakeDb({ queryRows: [[{ creditBalance: 1 }]], docCount: 1 });
    await charge(USER, 5, DOC, { db: f.db });

    expect(f.docUpdates).toHaveLength(1);
    expect(f.docUpdates[0]).toEqual({
      where: { id: DOC, userId: USER, status: "RUNNING", deletedAt: null },
      data: { status: "DONE", creditsUsed: 5 },
    });
  });

  it("bo'shatilgan hold ustidan charge throw qiladi va HECH NARSA yozmaydi", async () => {
    const f = fakeDb({ queryRows: [[]] });

    await expect(charge(USER, 5, DOC, { db: f.db })).rejects.toThrow(HoldMismatch);
    expect(f.txCreated).toEqual([]);
    expect(f.docUpdates).toEqual([]);
  });

  it("DONE hujjat ustidan charge ishlamaydi (idempotentlik darvozasi)", async () => {
    const f = fakeDb({ queryRows: [[{ creditBalance: 7 }]], docCount: 0 });

    await expect(charge(USER, 5, DOC, { db: f.db })).rejects.toThrow(DocumentNotRunning);
    // `creditTx.create` chaqirilgan, LEKIN tranzaksiya rollback bo'ladi —
    // fake rollback qila olmaydi, shuning uchun bu yerda faqat throw
    // tekshiriladi. Haqiqiy rollback `tests/integration/credits-race.test.ts` da.
  });
});

describe("release", () => {
  it("CreditTx YOZMAYDI va hujjatni FAILED qiladi", async () => {
    const f = fakeDb({ execRows: [1], docCount: 1 });

    await release(USER, 5, DOC, "gemini 503", { db: f.db });

    expect(f.txCreated).toEqual([]);
    expect(f.docUpdates[0]).toEqual({
      where: { id: DOC, userId: USER, status: { in: ["QUEUED", "RUNNING"] }, deletedAt: null },
      data: { status: "FAILED", failReason: "gemini 503" },
    });
  });

  it("failReason 500 belgiga qisqartiriladi", async () => {
    const f = fakeDb({ execRows: [1], docCount: 1 });

    await release(USER, 5, DOC, "x".repeat(900), { db: f.db });

    const data = f.docUpdates[0]!.data as { failReason: string };
    expect(data.failReason).toHaveLength(500);
  });

  it("hold bo'lmasa throw qiladi", async () => {
    const f = fakeDb({ execRows: [0] });

    await expect(release(USER, 5, DOC, "sabab", { db: f.db })).rejects.toThrow(HoldMismatch);
    expect(f.docUpdates).toEqual([]);
  });

  /**
   * `release()` KONTRAKTI: statusni o'zi `FAILED` ga o'tkazadi. Chaqiruvchi
   * oldin qo'lda o'zgartirsa darvoza `count === 0` ko'radi va rollback
   * kreditni BAND holatida qoldiradi.
   */
  it("allaqachon FAILED hujjat ustidan release throw qiladi", async () => {
    const f = fakeDb({ execRows: [1], docCount: 0 });

    await expect(release(USER, 5, DOC, "sabab", { db: f.db })).rejects.toThrow(DocumentNotRunning);
    expect(f.txCreated).toEqual([]);
  });
});

describe("grant / purchase", () => {
  it("grant bitta musbat CreditTx yozadi", async () => {
    const f = fakeDb({ queryRows: [[{ creditBalance: 70 }]] });

    const result = await grant(USER, 20, "admin:a-1", { db: f.db });

    expect(result).toBe(70);
    expect(f.txCreated).toEqual([
      { userId: USER, delta: 20, reason: "GRANT", refId: "admin:a-1", balanceAfter: 70 },
    ]);
  });

  it("purchase PURCHASE sababi bilan yozadi", async () => {
    const f = fakeDb({ queryRows: [[{ creditBalance: 150 }]] });

    await purchase(USER, 100, "pi-1", { db: f.db });

    expect(f.txCreated[0]).toMatchObject({ reason: "PURCHASE", refId: "pi-1", delta: 100 });
  });

  it("o'chirilgan foydalanuvchiga kredit qo'shilmaydi", async () => {
    const f = fakeDb({ queryRows: [[]] });

    await expect(grant(USER, 20, "admin:a-1", { db: f.db })).rejects.toThrow(CreditUserNotFound);
    expect(f.txCreated).toEqual([]);
  });
});

describe("tranzaksiya sozlamalari", () => {
  /**
   * `lib/db.ts` da `transactionOptions` yo'q — sukut 5 s (`P2028`). Bu
   * qiymat tushib qolsa nosozlik faqat Neon sekin daqiqasida, prodda
   * ko'rinadi. Shuning uchun u testda mahkamlangan.
   */
  it.each([
    ["charge", async (db: CreditDb) => charge(USER, 1, DOC, { db })],
    ["release", async (db: CreditDb) => release(USER, 1, DOC, "sabab", { db })],
    ["grant", async (db: CreditDb) => grant(USER, 1, "admin:a-1", { db })],
  ])("%s — { timeout: 10_000 } bilan ochiladi", async (_nom, run) => {
    const f = fakeDb({ queryRows: [[{ creditBalance: 1 }]], execRows: [1], docCount: 1 });

    await run(f.db);

    expect(f.txOptions).toEqual([{ timeout: 10_000 }]);
  });
});

describe("miqdor qorovuli", () => {
  it.each([
    ["nol", 0],
    ["manfiy", -1],
    ["kasr", 1.5],
    ["NaN", Number.NaN],
    ["juda katta", 10_001],
  ])("%s miqdorda bazaga umuman borilmaydi", async (_nom, amount) => {
    const f = fakeDb();

    await expect(hold(USER, amount, DOC, { db: f.db })).rejects.toSatisfy(
      (e: unknown) => isCreditError(e) && e.kind === "invalid_amount",
    );
    expect(f.sql).toEqual([]);
  });
});
