import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODELS } from "@/lib/llm";
import { tashkentDayStart, tashkentMonthStart } from "@/lib/budget/limits";

/**
 * A/B solishtiruvi va xarajat nazorati.
 *
 * Bu sahifa `LlmCall` va `Document` jadvallarini o'qiydi — alohida
 * o'lchov infratuzilmasi yo'q. Sifat ustuni 08-sessiyada (generatsiya)
 * `Document.qualityScore` to'lgach ma'noga kiradi; hozircha faqat
 * chaqiruvlar va xarajat ko'rinadi.
 *
 * Admin paneli i18n'dan ozod (CLAUDE.md, 1-qoida istisnosi) — faqat
 * o'zbek lotin.
 */
export default async function AdminQualityPage() {
  await requireAdmin();

  const now = new Date();
  const monthStart = tashkentMonthStart(now);
  const dayStart = tashkentDayStart(now);

  const [byModel, byPurpose, monthAgg, dayAgg, quality] = await Promise.all([
    prisma.llmCall.groupBy({
      by: ["provider", "model"],
      _count: { _all: true },
      _sum: { costUsd: true, tokensIn: true, tokensOut: true },
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.llmCall.groupBy({
      by: ["purpose"],
      _count: { _all: true },
      _sum: { costUsd: true },
      where: { createdAt: { gte: monthStart } },
      orderBy: { _sum: { costUsd: "desc" } },
      take: 15,
    }),
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: dayStart } },
    }),
    prisma.document.groupBy({
      by: ["status"],
      _count: { _all: true },
      _avg: { qualityScore: true },
      where: { deletedAt: null, createdAt: { gte: monthStart } },
    }),
  ]);

  const monthUsd = num(monthAgg._sum.costUsd);
  const dayUsd = num(dayAgg._sum.costUsd);
  const monthCalls = monthAgg._count._all;

  const modelRows = byModel
    .map((row) => {
      const cost = num(row._sum.costUsd);
      return {
        provider: row.provider,
        model: row.model,
        calls: row._count._all,
        cost,
        avgCost: row._count._all ? cost / row._count._all : 0,
        tokensIn: row._sum.tokensIn ?? 0,
        tokensOut: row._sum.tokensOut ?? 0,
        verified: MODELS[row.model as keyof typeof MODELS]?.verified ?? false,
        known: row.model in MODELS,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const done = quality.find((q) => q.status === "DONE");
  const failed = quality.find((q) => q.status === "FAILED");

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Bu oy xarajat" value={usd(monthUsd)} hint={`${monthCalls} ta chaqiruv`} />
        <StatCard title="Bugun xarajat" value={usd(dayUsd)} hint="Toshkent vaqti bo'yicha" />
        <StatCard
          title="O'rtacha sifat"
          value={done?._avg.qualityScore != null ? done._avg.qualityScore.toFixed(2) : "—"}
          hint={
            failed?._count._all
              ? `${failed._count._all} ta hujjat sifat bo'yicha rad etilgan`
              : "tayyor hujjatlar bo'yicha"
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-2">Model kesimida (shu oy)</h2>
        {modelRows.length === 0 ? (
          <p className="text-sm text-ink-2">
            Hali birorta LLM chaqiruvi yo&apos;q. Sinab ko&apos;rish:{" "}
            <code>pnpm llm:smoke</code>
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-ink-2">
                <tr>
                  <th className="px-3 py-2 font-medium">Provayder</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Chaqiruv</th>
                  <th className="px-3 py-2 text-right font-medium">Jami</th>
                  <th className="px-3 py-2 text-right font-medium">O&apos;rtacha</th>
                  <th className="px-3 py-2 text-right font-medium">Tokenlar</th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map((row) => (
                  <tr key={`${row.provider}-${row.model}`} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.provider}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {row.model}
                      {!row.known && (
                        <span className="ml-1 text-warn">· reyestrda yo&apos;q</span>
                      )}
                      {row.known && !row.verified && (
                        <span className="ml-1 text-warn">· narx tasdiqlanmagan</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ink">{row.calls}</td>
                    <td className="px-3 py-2 text-right text-ink">{usd(row.cost)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{usd(row.avgCost)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">
                      {row.tokensIn.toLocaleString()} / {row.tokensOut.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-2">
          &quot;Narx tasdiqlanmagan&quot; — bu model narxi rasmiy manbadan emas, ikkilamchi
          manbadan olingan (lib/llm/models.ts). Marja hisobiga tayanishdan oldin
          tekshiring.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-2">Eng qimmat maqsadlar (shu oy)</h2>
        {byPurpose.length === 0 ? (
          <p className="text-sm text-ink-2">Ma&apos;lumot yo&apos;q.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-ink-2">
                <tr>
                  <th className="px-3 py-2 font-medium">Maqsad</th>
                  <th className="px-3 py-2 text-right font-medium">Chaqiruv</th>
                  <th className="px-3 py-2 text-right font-medium">Xarajat</th>
                </tr>
              </thead>
              <tbody>
                {byPurpose.map((row) => (
                  <tr key={row.purpose} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.purpose}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{row._count._all}</td>
                    <td className="px-3 py-2 text-right text-ink">{usd(num(row._sum.costUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function num(v: { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function StatCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-4 py-3">
      <div className="text-sm text-ink-2">{title}</div>
      <div className="font-heading text-2xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-ink-2">{hint}</div>
    </div>
  );
}
