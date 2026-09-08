import { Fragment } from "react";
import { TopicNode, type TopicNodeData } from "@/components/admin/topic-node";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GRADES } from "@/lib/grades";

/**
 * Mavzular daraxti: fan + sinf tanlanadi, bo'lim -> mavzu ko'rinishida
 * chiqadi, har tugun joyida tahrirlanadi.
 *
 * Tanlov oddiy GET forma bilan (?fan=...&sinf=...) — JavaScript'siz ham
 * ishlaydi va havolani ulashish mumkin.
 *
 * TARTIB: `order`, keyin `slug`. Ikkinchi mezon MUHIM — CSV'da `order`
 * takrorlanishi mumkin, Postgres esa teng qiymatlarda tartibni
 * kafolatlamaydi, ya'ni daraxt har yuklashda sakrab turardi.
 */
export default async function AdminTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ fan?: string; sinf?: string }>;
}) {
  await requireAdmin();
  const { fan, sinf } = await searchParams;

  const subjects = await prisma.subject.findMany({
    orderBy: { slug: "asc" },
    select: { slug: true, nameUz: true },
  });

  const selectedSubject = subjects.find((subject) => subject.slug === fan) ?? subjects[0];
  const parsedGrade = Number(sinf);
  const selectedGrade = GRADES.find((grade) => grade === parsedGrade) ?? 7;

  const topics = selectedSubject
    ? await prisma.topic.findMany({
        where: {
          subject: { slug: selectedSubject.slug },
          grade: selectedGrade,
          deletedAt: null,
        },
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        select: {
          id: true,
          slug: true,
          parentId: true,
          titleUz: true,
          titleUzCyrl: true,
          titleRu: true,
          order: true,
          hoursPlan: true,
          objectives: true,
          keywords: true,
        },
      })
    : [];

  const childrenByParent = new Map<string, typeof topics>();
  for (const topic of topics) {
    if (topic.parentId === null) continue;
    const siblings = childrenByParent.get(topic.parentId) ?? [];
    siblings.push(topic);
    childrenByParent.set(topic.parentId, siblings);
  }
  const roots = topics.filter((topic) => topic.parentId === null);

  const toNode = (topic: (typeof topics)[number]): TopicNodeData => ({
    id: topic.id,
    slug: topic.slug,
    titleUz: topic.titleUz,
    titleUzCyrl: topic.titleUzCyrl,
    titleRu: topic.titleRu,
    order: topic.order,
    hoursPlan: topic.hoursPlan,
    objectives: topic.objectives,
    keywords: topic.keywords,
    childCount: childrenByParent.get(topic.id)?.length ?? 0,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">Mavzular</h2>
        <p className="text-sm text-ink-2">
          Yangi mavzular CSV import orqali qo&apos;shiladi (docs/curriculum-csv.md). Bu yerda
          mavjudlari tahrirlanadi.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Fan
          <select
            name="fan"
            defaultValue={selectedSubject?.slug}
            className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
          >
            {subjects.map((subject) => (
              <option key={subject.slug} value={subject.slug}>
                {subject.nameUz}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Sinf
          <select
            name="sinf"
            defaultValue={String(selectedGrade)}
            className="h-8 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
          >
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade}-sinf
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Ko&apos;rsatish
        </Button>
      </form>

      {roots.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
          {selectedSubject
            ? `${selectedSubject.nameUz}, ${selectedGrade}-sinf uchun mavzu yo'q.`
            : "Fan yo'q — avval pnpm db:seed."}
        </p>
      ) : (
        <ul className="rounded-md border border-line px-3">
          {roots.map((root) => (
            // Ikki daraja: bo'lim va uning mavzulari. Chuqurroq daraxt
            // hozircha kurikulumda yo'q; paydo bo'lsa bu joy rekursiyaga
            // aylanadi.
            <Fragment key={root.id}>
              <TopicNode topic={toNode(root)} depth={0} />
              {(childrenByParent.get(root.id) ?? []).map((child) => (
                <TopicNode key={child.id} topic={toNode(child)} depth={1} />
              ))}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
