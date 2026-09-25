import { describe, expect, it } from "vitest";
import { readSpend } from "@/lib/budget/spend";
import { tashkentDayStart, tashkentMonthStart } from "@/lib/budget/limits";

/**
 * `readSpend` bazaga boradi, shuning uchun bu yerda soxta `llmCall` bilan
 * sinaladi. Tekshiriladigani — SO'ROV SHAKLI: qaysi oyna so'ralyapti,
 * `Decimal` qanday songa aylanyapti va `userId` bo'lmaganda foydalanuvchi
 * so'rovi umuman yuborilmayaptimi. Arifmetikaning o'zi Postgres'da.
 */

type AggregateArgs = {
  _sum: { costUsd: true };
  where: { createdAt: { gte: Date }; userId?: string };
};

type GroupByArgs = { by: ["provider"]; _count: { _all: true }; where: { createdAt: { gte: Date } } };

type AggregateResult = { _sum: { costUsd: { toString(): string } | null } };

type GroupByResult = { provider: string; _count: { _all: number } };

/** `Decimal(10,6)` ustuni Prisma'dan obyekt bo'lib qaytadi, son bo'lib emas. */
const decimal = (v: string) => ({ toString: () => v });

function fakeDb(opts: {
  sums?: Array<{ toString(): string } | null>;
  groups?: GroupByResult[];
}) {
  const aggregateCalls: AggregateArgs[] = [];
  const groupByCalls: GroupByArgs[] = [];
  const sums = opts.sums ?? [];
  let i = 0;

  const db = {
    llmCall: {
      aggregate(args: AggregateArgs): Promise<AggregateResult> {
        aggregateCalls.push(args);
        return Promise.resolve({ _sum: { costUsd: sums[i++] ?? null } });
      },
      groupBy(args: GroupByArgs): Promise<GroupByResult[]> {
        groupByCalls.push(args);
        return Promise.resolve(opts.groups ?? []);
      },
    },
  };

  return { db: db as unknown as Parameters<typeof readSpend>[1], aggregateCalls, groupByCalls };
}

const now = new Date("2026-09-24T22:30:00Z"); // = 25-sentyabr 03:30 Toshkentda

describe("readSpend — so'rov oynalari", () => {
  it("oy va kun chegaralari Toshkent vaqtidan olinadi", async () => {
    const { db, aggregateCalls, groupByCalls } = fakeDb({});
    await readSpend({ userId: "u1", now }, db);

    expect(aggregateCalls).toHaveLength(3);
    expect(aggregateCalls[0]!.where.createdAt.gte.toISOString()).toBe(
      tashkentMonthStart(now).toISOString(),
    );
    expect(aggregateCalls[1]!.where.createdAt.gte.toISOString()).toBe(
      tashkentDayStart(now).toISOString(),
    );
    expect(groupByCalls[0]!.where.createdAt.gte.toISOString()).toBe(
      tashkentDayStart(now).toISOString(),
    );
  });

  it("foydalanuvchi oynasi kun boshidan va faqat o'sha userId bo'yicha", async () => {
    const { db, aggregateCalls } = fakeDb({});
    await readSpend({ userId: "u1", now }, db);

    expect(aggregateCalls[2]!.where.userId).toBe("u1");
    expect(aggregateCalls[2]!.where.createdAt.gte.toISOString()).toBe(
      tashkentDayStart(now).toISOString(),
    );
  });

  it("tizim chaqirig'ida (userId = null) foydalanuvchi so'rovi yuborilmaydi", async () => {
    const { db, aggregateCalls } = fakeDb({});
    const spend = await readSpend({ userId: null, now }, db);

    expect(aggregateCalls).toHaveLength(2);
    expect(spend.userDayUsd).toBe(0);
  });
});

describe("readSpend — qiymatlarni o'qish", () => {
  it("Decimal obyekti songa aylanadi", async () => {
    const { db } = fakeDb({
      sums: [decimal("12.345678"), decimal("1.500000"), decimal("0.250000")],
    });
    const spend = await readSpend({ userId: "u1", now }, db);

    expect(spend.monthUsd).toBeCloseTo(12.345678, 6);
    expect(spend.dayUsd).toBeCloseTo(1.5, 6);
    expect(spend.userDayUsd).toBeCloseTo(0.25, 6);
  });

  it("hali chaqiruv bo'lmasa (SUM = null) nol qaytadi, NaN emas", async () => {
    const { db } = fakeDb({ sums: [null, null, null] });
    const spend = await readSpend({ userId: "u1", now }, db);

    expect(spend).toMatchObject({ monthUsd: 0, dayUsd: 0, userDayUsd: 0 });
  });

  it("son bo'lmagan qiymat shiftni ochib yubormaydi", async () => {
    const { db } = fakeDb({ sums: [decimal("chala"), null, null] });
    const spend = await readSpend({ userId: "u1", now }, db);

    expect(spend.monthUsd).toBe(0);
  });
});

describe("readSpend — provayder kesimidagi chaqiruvlar", () => {
  it("groupBy natijasi bepul kvota uchun xaritaga yig'iladi", async () => {
    const { db } = fakeDb({
      groups: [
        { provider: "gemini", _count: { _all: 137 } },
        { provider: "anthropic", _count: { _all: 4 } },
      ],
    });
    const spend = await readSpend({ userId: "u1", now }, db);

    expect(spend.providerDayCalls).toEqual({ gemini: 137, anthropic: 4 });
  });

  it("bugun chaqiruv bo'lmasa xarita bo'sh", async () => {
    const { db } = fakeDb({});
    const spend = await readSpend({ userId: null, now }, db);

    expect(spend.providerDayCalls).toEqual({});
  });
});
