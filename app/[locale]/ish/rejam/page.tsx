import { AlertTriangle, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/plan/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { auth } from "@/lib/auth";
import { currentTopicIdOn, placeTopics, schoolDay } from "@/lib/calendar/placement";
import { buildPlanRows } from "@/lib/calendar/plan-view";
import { flattenTopicTree } from "@/lib/calendar/topic-sequence";
import { prisma } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";
import { topicTitle } from "@/lib/topic-title";

/**
 * "Rejam" — taqvim-mavzu reja: qaysi mavzu qaysi haftada.
 *
 * Tanlov `?fan=&sinf=&chorak=` bilan: JavaScript'siz ishlaydi va havolani
 * ulashish mumkin (`app/[locale]/admin/mavzular/page.tsx` naqshi).
 *
 * `lessonsPerWeek` HOZIRCHA TAXMIN: sinf va dars jadvali 09-sessiyada
 * qo'shiladi, shuning uchun soat yig'indisi o'quv haftalariga bo'linadi va
 * dars kunlari dushanba–juma deb olinadi. Sahifada bu ochiq aytiladi.
 */

const WEEKS_MS = 7 * 24 * 60 * 60 * 1000;
/** Dars kunlari taxmini — aniq jadval 09-sessiyada. */
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

type Search = { fan?: string; sinf?: string; chorak?: string };

/** O'quv yilidagi dars haftalari soni (choraklar uzunligi yig'indisi). */
function teachingWeeks(quarters: { startsOn: Date; endsOn: Date }[]): number {
  const ms = quarters.reduce(
    (total, quarter) => total + (quarter.endsOn.getTime() - quarter.startsOn.getTime()),
    0,
  );
  return Math.max(1, Math.round(ms / WEEKS_MS));
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">{text}</p>
  );
}

export default async function RejamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Plan");
  const { locale: routeLocale } = await params;
  const { fan, sinf, chorak } = await searchParams;

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-ink">{t("title")}</h1>
        <Empty text={t("noSelection")} />
      </div>
    );
  }

  const [year] = await prisma.academicYear.findMany({
    // `findFirst` YETARLI EMAS: xato UPDATE ikkita faol yil qoldirsa u
    // tasodifiy birini olib jimgina noto'g'ri reja berardi.
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: {
      quarters: {
        orderBy: { number: "asc" },
        select: { number: true, startsOn: true, endsOn: true },
      },
      holidays: {
        // Viloyat filtri SO'ROVDA: `placement.ts` sof funksiya, u tayyor
        // ta'til ro'yxatini oladi. `user.region` bo'sh bo'lsa faqat GLOBAL
        // ta'tillar qo'llanadi — viloyat ta'tili TUSHMAYDI, chunki qaysi
        // viloyat ekani ma'lum emas.
        where: {
          deletedAt: null,
          ...(user.region
            ? { OR: [{ scope: "GLOBAL" as const }, { scope: "REGION" as const, region: user.region }] }
            : { scope: "GLOBAL" as const }),
        },
        select: { startsOn: true, endsOn: true },
      },
    },
  });

  const topicRows = await prisma.topic.findMany({
    where: { subject: { slug: subject.slug }, grade, deletedAt: null },
    // `slug` ikkinchi mezon SHART — CSV'da `order` takrorlanadi va Postgres
    // teng qiymatlarda tartibni kafolatlamaydi.
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      parentId: true,
      order: true,
      slug: true,
      quarter: true,
      hoursPlan: true,
      titleUz: true,
      titleUzCyrl: true,
      titleRu: true,
    },
  });

  const titleById = new Map(topicRows.map((topic) => [topic.id, topicTitle(topic, locale)]));
  const sequenced = flattenTopicTree(topicRows);

  const quarters = year?.quarters ?? [];
  const totalHours = sequenced.reduce((sum, topic) => sum + (topic.hoursPlan ?? 1), 0);
  const lessonsPerWeek = Math.max(1, Math.round(totalHours / teachingWeeks(quarters)));

  const placement = placeTopics({
    quarters,
    holidays: year?.holidays ?? [],
    topics: sequenced,
    lessonsPerWeek,
    weekdays: DEFAULT_WEEKDAYS,
  });

  const today = schoolDay(new Date());
  const rows = buildPlanRows({
    topics: sequenced,
    slots: placement.slots,
    quarters,
    currentTopicId: currentTopicIdOn(placement.slots, today),
    today,
  });

  const selectedQuarter = quarters.find((item) => item.number === Number(chorak))?.number ?? 1;
  const visible = rows.filter((row) => row.quarter === selectedQuarter);
  const undated = rows.filter((row) => row.quarter === null);

  const dateFormat = new Intl.DateTimeFormat(routeLocale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="text-sm text-ink-2">{t("estimateNotice")}</p>
      </div>

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
        <input type="hidden" name="chorak" value={String(selectedQuarter)} />
        <Button type="submit" size="sm">
          {t("show")}
        </Button>
      </form>

      {quarters.length === 0 ? (
        <Empty text={t("noCalendar")} />
      ) : sequenced.length === 0 ? (
        <Empty text={t("noTopics")} />
      ) : (
        <>
          {/* Mobil birinchi: chorak tanlagich yuqorida, ro'yxat ostida. */}
          <nav className="flex flex-wrap gap-2">
            {quarters.map((quarter) => (
              <Link
                key={quarter.number}
                href={{
                  pathname: "/ish/rejam",
                  query: { fan: subject.slug, sinf: String(grade), chorak: String(quarter.number) },
                }}
                aria-current={quarter.number === selectedQuarter ? "page" : undefined}
                className={
                  quarter.number === selectedQuarter
                    ? "rounded-full border border-transparent bg-accent px-3.5 py-2 text-sm font-medium text-on-accent"
                    : "rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-muted"
                }
              >
                {t("quarterLabel", { number: quarter.number })}
              </Link>
            ))}
          </nav>

          {placement.unplaced.length > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
              {t("unplacedNotice", { count: placement.unplaced.length })}
            </p>
          )}

          {visible.length === 0 ? (
            <Empty text={t("emptyQuarter")} />
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((row) => (
                <li
                  key={row.topicId}
                  className={
                    row.status === "current"
                      ? "flex flex-col gap-2 rounded-xl border border-accent bg-surface px-3 py-3"
                      : "flex flex-col gap-2 rounded-xl border border-line px-3 py-3"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-ink">
                      {titleById.get(row.topicId) ?? row.topicId}
                    </span>
                    <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                    <span>
                      {row.firstDate ? dateFormat.format(row.firstDate) : t("noDate")}
                    </span>
                    <span>{t("hours", { count: row.hours })}</span>
                    {row.compressed && (
                      <span className="inline-flex items-center gap-1 text-warn">
                        <Users className="size-3.5" strokeWidth={1.5} />
                        {t("compressed")}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {undated.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-ink-2">{t("undatedTitle")}</h2>
              <ul className="flex flex-col gap-1">
                {undated.map((row) => (
                  <li key={row.topicId} className="rounded-md border border-line px-3 py-2 text-sm text-ink">
                    {titleById.get(row.topicId) ?? row.topicId}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
