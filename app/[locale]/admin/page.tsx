import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Statistika. Sahifa dinamik (auth cookie o'qiydi), shuning uchun kesh
 * invalidatsiyasi kerak emas — har yuklashda joriy raqamlar.
 */
export default async function AdminStatsPage() {
  await requireAdmin();

  const [subjects, users, topicGroups] = await Promise.all([
    prisma.subject.findMany({ select: { id: true, slug: true, nameUz: true, isActive: true } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.topic.groupBy({
      by: ["subjectId", "grade"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const nameById = new Map(subjects.map((subject) => [subject.id, subject.nameUz]));

  const rows = topicGroups
    .map((group) => ({
      subject: nameById.get(group.subjectId) ?? group.subjectId,
      grade: group.grade,
      count: group._count._all,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.grade - b.grade);

  const totalTopics = rows.reduce((sum, row) => sum + row.count, 0);
  const activeSubjects = subjects.filter((subject) => subject.isActive).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Fanlar"
          value={subjects.length}
          hint={`${activeSubjects} ta faol · ${subjects.length - activeSubjects} ta tez orada`}
        />
        <StatCard title="Mavzular" value={totalTopics} hint="o'chirilganlar hisobga olinmagan" />
        <StatCard title="Foydalanuvchilar" value={users} hint="o'chirilganlar hisobga olinmagan" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-2">Mavzular: fan va sinf bo&apos;yicha</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">
            Hali mavzu yo&apos;q. CSV import qiling: <code>pnpm curriculum:import</code> (docs/
            curriculum-csv.md).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-ink-2">
                <tr>
                  <th className="px-3 py-2 font-medium">Fan</th>
                  <th className="px-3 py-2 font-medium">Sinf</th>
                  <th className="px-3 py-2 text-right font-medium">Mavzular</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.subject}-${row.grade}`} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{row.subject}</td>
                    <td className="px-3 py-2 text-ink-2">{row.grade}-sinf</td>
                    <td className="px-3 py-2 text-right text-ink">{row.count}</td>
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

function StatCard({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-4 py-3">
      <div className="text-sm text-ink-2">{title}</div>
      <div className="font-heading text-2xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-ink-2">{hint}</div>
    </div>
  );
}
