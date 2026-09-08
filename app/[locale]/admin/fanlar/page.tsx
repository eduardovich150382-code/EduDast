import { SubjectActiveToggle } from "@/components/admin/subject-active-toggle";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Fanlar jadvali: `isActive` boshqaruvi va har fanda nechta mavzu /
 * nechta o'qituvchi borligi.
 *
 * "Nechta o'qituvchi tanlagan" — `User.subjects` STRING massivi (slug),
 * FK emas, shuning uchun `groupBy` bilan sanab bo'lmaydi. Foydalanuvchilar
 * soni hozircha kichik, shuning uchun slug massivlari o'qib olinib
 * xotirada sanaladi; bu sekinlashsa `$queryRaw` + `unnest` ga o'tiladi.
 */
export default async function AdminSubjectsPage() {
  await requireAdmin();

  const [subjects, users] = await Promise.all([
    prisma.subject.findMany({
      orderBy: [{ isActive: "desc" }, { slug: "asc" }],
      select: {
        slug: true,
        nameUz: true,
        isActive: true,
        _count: { select: { topics: { where: { deletedAt: null } } } },
      },
    }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { subjects: true } }),
  ]);

  const teachersBySlug = new Map<string, number>();
  for (const user of users) {
    for (const slug of new Set(user.subjects)) {
      teachersBySlug.set(slug, (teachersBySlug.get(slug) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">Fanlar</h2>
        <p className="text-sm text-ink-2">
          &quot;Faol&quot; fan onboarding&apos;da &quot;tez orada&quot; belgisisiz ko&apos;rinadi.
          O&apos;zgarish darhol kuchga kiradi.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-ink-2">
            <tr>
              <th className="px-3 py-2 font-medium">Fan</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 text-right font-medium">Mavzular</th>
              <th className="px-3 py-2 text-right font-medium">O&apos;qituvchilar</th>
              <th className="px-3 py-2 text-right font-medium">Holat</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.slug} className="border-t border-line">
                <td className="px-3 py-2 text-ink">{subject.nameUz}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">{subject.slug}</td>
                <td className="px-3 py-2 text-right text-ink">{subject._count.topics}</td>
                <td className="px-3 py-2 text-right text-ink">
                  {teachersBySlug.get(subject.slug) ?? 0}
                </td>
                <td className="px-3 py-2">
                  <SubjectActiveToggle slug={subject.slug} isActive={subject.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
