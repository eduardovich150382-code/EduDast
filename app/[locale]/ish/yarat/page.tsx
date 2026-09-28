import { getTranslations } from "next-intl/server";
import { CreateForm } from "@/components/generation/create-form";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { creditCost } from "@/lib/credits/cost-table";
import { prisma } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";
import { topicTitle } from "@/lib/topic-title";

/**
 * Dars ishlanma yaratish sahifasi.
 *
 * Fan/sinf/chorak tanlovi `?fan=&sinf=&chorak=` bilan — JavaScript'siz
 * ishlaydi va "Rejam" dan kelgan havola to'g'ridan-to'g'ri mavzuni ochadi
 * (`app/[locale]/ish/rejam/page.tsx` naqshi).
 *
 * To'liq sehrgar (bosqichma-bosqich, oldindan ko'rish bilan) — 11-sessiya.
 */

/** Dars davomiyligi variantlari. 90 — qo'sh dars. */
const DURATIONS = [35, 45, 60, 90];
const DEFAULT_DURATION = 45;

type Search = { fan?: string; sinf?: string; chorak?: string; mavzu?: string };

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">{text}</p>
  );
}

export default async function YaratPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Generator");
  const { fan, sinf, chorak, mavzu } = await searchParams;

  const subjects = await prisma.subject.findMany({
    where: { slug: { in: user.subjects } },
    orderBy: { slug: "asc" },
    select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true },
  });
  const grades = GRADES.filter((grade) => user.grades.includes(grade));

  const subject = subjects.find((item) => item.slug === fan) ?? subjects[0];
  const grade = grades.find((item) => item === Number(sinf)) ?? grades[0];

  if (!subject || grade === undefined) {
    return (
      <Shell title={t("title")} description={t("description")}>
        <Empty text={t("noSelection")} />
      </Shell>
    );
  }

  const quarterFilter = Number(chorak);
  const topicRows = await prisma.topic.findMany({
    where: {
      subject: { slug: subject.slug },
      grade,
      deletedAt: null,
      ...(Number.isInteger(quarterFilter) && quarterFilter > 0
        ? { quarter: quarterFilter }
        : {}),
    },
    // `slug` ikkinchi mezon SHART — CSV'da `order` takrorlanadi va Postgres
    // teng qiymatlarda tartibni kafolatlamaydi (`rejam` bilan bir xil sabab).
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      titleUz: true,
      titleUzCyrl: true,
      titleRu: true,
    },
  });

  const topics = topicRows.map((topic) => ({ id: topic.id, title: topicTitle(topic, locale) }));

  return (
    <Shell title={t("title")} description={t("description")}>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          {t("subject")}
          <select
            name="fan"
            defaultValue={subject.slug}
            className="h-9 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
          >
            {subjects.map((item) => (
              <option key={item.slug} value={item.slug}>
                {subjectName(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          {t("grade")}
          <select
            name="sinf"
            defaultValue={String(grade)}
            className="h-9 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
          >
            {grades.map((item) => (
              <option key={item} value={item}>
                {t("gradeLabel", { grade: item })}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">
          {t("show")}
        </Button>
      </form>

      {topics.length === 0 ? (
        <Empty text={t("noTopics")} />
      ) : (
        <CreateForm
          topics={topics}
          selectedTopicId={topics.find((topic) => topic.id === mavzu)?.id ?? null}
          durations={DURATIONS}
          defaultDuration={DEFAULT_DURATION}
          cost={creditCost({ type: "LESSON_PLAN" })}
        />
      )}
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-2">{description}</p>
      </div>
      {children}
    </div>
  );
}
