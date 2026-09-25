import { prisma } from "@/lib/db";
import { tashkentDayStart, tashkentMonthStart } from "./limits";

/**
 * Sarflangan xarajatni o'qish.
 *
 * `LlmCall.costUsd` — `Decimal`, shuning uchun Prisma uni `Decimal` obyekti
 * sifatida qaytaradi. Uni `Number` ga aylantirish faqat SOLISHTIRISH uchun
 * xavfsiz (shift tekshiruvi) — bazaga qaytib yozilmaydi.
 */

export type SpendSnapshot = {
  monthUsd: number;
  dayUsd: number;
  userDayUsd: number;
  /** Bugun shu provayderga qilingan chaqiruvlar soni (bepul kvota uchun). */
  providerDayCalls: Record<string, number>;
};

type Db = Pick<typeof prisma, "llmCall">;

export async function readSpend(
  opts: { userId: string | null; now: Date },
  db: Db = prisma,
): Promise<SpendSnapshot> {
  const monthStart = tashkentMonthStart(opts.now);
  const dayStart = tashkentDayStart(opts.now);

  const [month, day, userDay, byProvider] = await Promise.all([
    db.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: monthStart } },
    }),
    db.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: dayStart } },
    }),
    opts.userId
      ? db.llmCall.aggregate({
          _sum: { costUsd: true },
          where: { userId: opts.userId, createdAt: { gte: dayStart } },
        })
      : Promise.resolve({ _sum: { costUsd: null } }),
    db.llmCall.groupBy({
      by: ["provider"],
      _count: { _all: true },
      where: { createdAt: { gte: dayStart } },
    }),
  ]);

  const providerDayCalls: Record<string, number> = {};
  for (const row of byProvider) {
    providerDayCalls[row.provider] = row._count._all;
  }

  return {
    monthUsd: toNumber(month._sum.costUsd),
    dayUsd: toNumber(day._sum.costUsd),
    userDayUsd: toNumber(userDay._sum.costUsd),
    providerDayCalls,
  };
}

function toNumber(v: { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}
