import { CalendarPlus, Plus, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TopicShift } from "@/components/week/topic-shift";
import { auth } from "@/lib/auth";
import { schoolDay } from "@/lib/calendar/placement";
import { positionForClass, teachingWeek } from "@/lib/calendar/position";
import { flattenTopicTree } from "@/lib/calendar/topic-sequence";
import { prisma } from "@/lib/db";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { Link } from "@/lib/i18n/navigation";
import { subjectName } from "@/lib/subject-name";
import { topicTitle } from "@/lib/topic-title";

/**
 * Haftalik bosh sahifa (09-sessiya, 5-band).
 *
 * Mahsulotning asosiy g'oyasi shu yerda: o'qituvchi hech narsa tanlamasdan
 * haftaning har kuni uchun qaysi sinf, qaysi mavzu va qanday material tayyor
 * ekanini ko'radi. Oldingi 4 ta "Tez orada" kartasi olib tashlandi.
 *
 * Hisob `lib/calendar/position.ts` da — SOF modul, har sinf uchun alohida
 * chaqiriladi. Shu sababli 7-A va 7-B turli mavzuda tursa ikkisi ham to'g'ri
 * chiqadi: umumiy holat yo'q.
 *
 * MATERIALLAR `Document` dan `userId + topicId` bo'yicha olinadi. `LessonPlan`
 * ATAYLAB ishlatilmaydi — qarz `docs/qarzlar-kechiktirilgan.md` da.
 */

type ClassRow = {
  id: string;
  grade: number;
  label: string;
  lessonsPerWeek: number;
  topicOffset: number;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  weekdays: number[];
  anchor?: { topicId: string; taughtOn: Date };
};

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">{text}</p>
  );
}

export default async function IshPage() {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`
  // orqali natija qayta ishlatiladi) — bu yerdagi `auth()` bazaga qayta
  // bormaydi va foydalanuvchi kafolatlangan holda mavjud.
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Week");
  // Salomlashish va fan ogohlantirishi `Ish` nomfazasida qoladi — ular hafta
  // ko'rinishiga tegishli emas.
  const tIsh = await getTranslations("Ish");

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
        // ta'til ro'yxatini oladi.
        where: {
          deletedAt: null,
          ...(user.region
            ? {
                OR: [
                  { scope: "GLOBAL" as const },
                  { scope: "REGION" as const, region: user.region },
                ],
              }
            : { scope: "GLOBAL" as const }),
        },
        select: { startsOn: true, endsOn: true },
      },
    },
  });

  const classRows = await prisma.teachingClass.findMany({
    // `deletedAt: null` MAJBURIY (CLAUDE.md soft delete qoidasi).
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ grade: "asc" }, { label: "asc" }],
    select: {
      id: true,
      grade: true,
      label: true,
      lessonsPerWeek: true,
      topicOffset: true,
      subjectId: true,
      subject: { select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true } },
      slots: { where: { deletedAt: null }, select: { weekday: true } },
      progress: {
        // Anchor — eng oxirgi o'tilgan mavzu (`@@index([teachingClassId, taughtOn])`).
        where: { status: "DONE", taughtOn: { not: null } },
        orderBy: { taughtOn: "desc" },
        take: 1,
        select: { topicId: true, taughtOn: true },
      },
    },
  });

  const classes: ClassRow[] = classRows.map((row) => {
    const anchorRow = row.progress[0];
    return {
      id: row.id,
      grade: row.grade,
      label: row.label,
      lessonsPerWeek: row.lessonsPerWeek,
      topicOffset: row.topicOffset,
      subjectId: row.subjectId,
      subjectSlug: row.subject.slug,
      subjectName: subjectName(row.subject, locale),
      weekdays: row.slots.map((slot) => slot.weekday),
      anchor: anchorRow?.taughtOn
        ? { topicId: anchorRow.topicId, taughtOn: anchorRow.taughtOn }
        : undefined,
    };
  });

  const today = schoolDay(new Date());
  const quarters = year?.quarters ?? [];
  const period = teachingWeek(quarters, today);

  // SINF YO'Q — onboarding'dagi tanlovdan foydalanib taklif beramiz.
  if (classes.length === 0) {
    return (
      <Shell greeting={tIsh("greeting", { name: user.fullName })}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line px-3 py-8 text-center">
          <Users className="size-6 text-accent" strokeWidth={1.5} />
          <p className="text-sm text-ink-2">{t("noClasses")}</p>
          <Link href="/ish/sinflarim" className={LINK_BUTTON}>
            <Plus className="size-4" strokeWidth={1.5} />
            {t("addClasses")}
          </Link>
        </div>
      </Shell>
    );
  }

  // Mavzular (subjectId, grade) juftligi bo'yicha BIR MARTA olinadi — 7-A va
  // 7-B bir xil kurikulumga tayanadi, ikki marta so'rash bekorchilik.
  const uniquePairs = [...new Set(classes.map((row) => `${row.subjectId}:${row.grade}`))];
  const topicsByPair = new Map<string, Awaited<ReturnType<typeof loadTopics>>>();
  await Promise.all(
    uniquePairs.map(async (pair) => {
      const [subjectId, grade] = pair.split(":");
      topicsByPair.set(pair, await loadTopics(subjectId!, Number(grade)));
    }),
  );

  const positions = classes.map((row) => {
    const pair = topicsByPair.get(`${row.subjectId}:${row.grade}`)!;
    return {
      row,
      titleById: pair.titleById,
      orderById: pair.orderById,
      position: positionForClass({
        quarters,
        holidays: year?.holidays ?? [],
        topics: pair.sequenced,
        lessonsPerWeek: row.lessonsPerWeek,
        weekdays: row.weekdays,
        anchor: row.anchor,
        topicOffset: row.topicOffset,
        today,
      }),
    };
  });

  // Materiallar: haftadagi HAMMA mavzu uchun BITTA so'rov (N+1 bo'lmasin).
  const weekTopicIds = [
    ...new Set(positions.flatMap(({ position }) => position.weekTopicIds)),
  ];
  const documents = weekTopicIds.length
    ? await prisma.document.findMany({
        where: {
          userId: user.id,
          topicId: { in: weekTopicIds },
          deletedAt: null,
          status: "DONE",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, topicId: true, type: true },
      })
    : [];

  const docsByTopic = new Map<string, { id: string; type: string }[]>();
  for (const doc of documents) {
    const list = docsByTopic.get(doc.topicId);
    if (list) list.push(doc);
    else docsByTopic.set(doc.topicId, [doc]);
  }

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    // UTC — sana shartnomasi (`placement.ts`). Mahalliy mintaqada sana bir
    // kunga siljib ko'rinardi.
    timeZone: "UTC",
  });

  const lessonCount = positions.reduce(
    (total, { position }) => total + position.days.reduce((sum, day) => sum + day.topicIds.length, 0),
    0,
  );
  const readyCount = positions.reduce(
    (total, { position }) =>
      total +
      position.days.reduce(
        (sum, day) => sum + day.topicIds.filter((id) => docsByTopic.has(id)).length,
        0,
      ),
    0,
  );

  /** Sinf nomi: "Fizika 7-A" yoki harfsiz "Fizika 7". */
  function className(row: ClassRow): string {
    return row.label
      ? t("classLabel", { subject: row.subjectName, grade: row.grade, letter: row.label })
      : t("classLabelNoLetter", { subject: row.subjectName, grade: row.grade });
  }

  function prepareHref(row: ClassRow, topicId: string) {
    return {
      pathname: "/ish/yarat" as const,
      query: {
        fan: row.subjectSlug,
        sinf: String(row.grade),
        ...(period ? { chorak: String(period.quarter) } : {}),
        mavzu: topicId,
      },
    };
  }

  /** Mavzu qatori — nomi, tartib raqami, materiallar va ‹ › tugmalari. */
  function TopicLine({
    entry,
    topicId,
  }: {
    entry: (typeof positions)[number];
    topicId: string;
  }) {
    const docs = docsByTopic.get(topicId) ?? [];
    const order = entry.orderById.get(topicId);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {entry.titleById.get(topicId) ?? topicId}
            </p>
            {order !== undefined && (
              <p className="text-xs text-ink-2">{t("topicNumber", { number: order })}</p>
            )}
          </div>
          {/* Chegara server bilan BIR XIL manbadan — `shiftClassPosition` ham
              aynan shu ikki maydonni o'qiydi, ya'ni "tugma faol, lekin server
              rad etadi" holati bo'lmaydi. */}
          <TopicShift
            teachingClassId={entry.row.id}
            canBack={entry.position.previousTopicId !== null}
            canForward={entry.position.nextTopicId !== null}
            backLabel={t("shiftBackward")}
            forwardLabel={t("shiftForward")}
            errors={{ chegara: t("errors.chegara") }}
            genericError={t("errors.generic")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/ish/hujjat/${doc.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink hover:bg-muted"
            >
              {t(`materials.${doc.type}`)}
            </Link>
          ))}
          <Link href={prepareHref(entry.row, topicId)} className={PREPARE_BUTTON}>
            {t("prepare")}
          </Link>
        </div>
      </div>
    );
  }

  const scheduled = positions.filter(({ position }) => position.mode === "days");
  const unscheduled = positions.filter(({ position }) => position.mode === "week");

  // Kunlarni birlashtiramiz: bitta kunda bir nechta sinfning darsi bo'lishi
  // mumkin, o'qituvchi esa kun bo'yicha o'ylaydi.
  const dayMap = new Map<
    number,
    { date: Date; weekday: number; past: boolean; items: { entry: (typeof positions)[number]; topicId: string }[] }
  >();
  for (const entry of scheduled) {
    for (const day of entry.position.days) {
      const key = day.date.getTime();
      const bucket = dayMap.get(key) ?? {
        date: day.date,
        weekday: day.weekday,
        past: day.past,
        items: [],
      };
      for (const topicId of day.topicIds) bucket.items.push({ entry, topicId });
      dayMap.set(key, bucket);
    }
  }
  const days = [...dayMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <Shell greeting={tIsh("greeting", { name: user.fullName })}>
      <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-3 py-3">
        <p className="text-sm font-medium text-ink">
          {period
            ? t("quarterWeek", { quarter: period.quarter, week: period.week })
            : t("noQuarter")}
        </p>
        <p className="text-xs text-ink-2">
          {dateFormat.format(positions[0]!.position.weekStart)} —{" "}
          {dateFormat.format(positions[0]!.position.weekEnd)}
        </p>
        <p className="text-sm text-ink-2">
          {lessonCount === 0
            ? t("summaryNone")
            : t("summary", { lessons: lessonCount, ready: readyCount })}
        </p>
      </div>

      {quarters.length === 0 && <Empty text={t("noCalendar")} />}

      {days.map((day) => (
        <div key={day.date.getTime()} className="flex flex-col gap-2">
          <h2 className={day.past ? "text-sm font-medium text-ink-2" : "text-sm font-medium text-ink"}>
            {t(`weekday.${day.weekday}`)}
            <span className="ml-2 text-xs font-normal text-ink-2">
              {dateFormat.format(day.date)}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {day.items.map(({ entry, topicId }) => (
              <li
                key={`${entry.row.id}-${topicId}`}
                className={
                  day.past
                    ? "flex flex-col gap-2 rounded-xl border border-line px-3 py-3 opacity-60"
                    : "flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-3"
                }
              >
                <p className="text-xs font-medium text-ink-2">{className(entry.row)}</p>
                <TopicLine entry={entry} topicId={topicId} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* JADVAL YO'Q — kun aniqlanmaydi, faqat "bu hafta qaysi mavzu". */}
      {unscheduled.map((entry) => {
        const topicId = entry.position.weekTopicIds[0] ?? entry.position.currentTopicId;
        return (
          <div
            key={entry.row.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-3"
          >
            <p className="text-xs font-medium text-ink-2">{className(entry.row)}</p>
            {topicId === undefined || topicId === null ? (
              <p className="text-sm text-ink-2">{t("noTopics")}</p>
            ) : (
              <>
                <p className="text-sm text-ink">
                  {t("weekTopic", { topic: entry.titleById.get(topicId) ?? topicId })}
                </p>
                <TopicLine entry={entry} topicId={topicId} />
              </>
            )}
            <Link
              href="/ish/jadval"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 underline-offset-4 hover:underline"
            >
              <CalendarPlus className="size-3.5" strokeWidth={1.5} />
              {t("enterSchedule")}
            </Link>
          </div>
        );
      })}

      {days.length === 0 && unscheduled.length === 0 && quarters.length > 0 && (
        <Empty text={t("summaryNone")} />
      )}
    </Shell>
  );
}

const LINK_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-transparent bg-accent px-4 py-2 text-sm font-medium text-on-accent";
const PREPARE_BUTTON =
  "inline-flex min-h-11 items-center gap-1 rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent";

/** Sinf kurikulumi: yassilangan ketma-ketlik + ko'rinadigan nom va tartib. */
async function loadTopics(subjectId: string, grade: number) {
  const rows = await prisma.topic.findMany({
    where: { subjectId, grade, deletedAt: null },
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
  const locale = await getAppLocale();
  const sequenced = flattenTopicTree(rows);
  return {
    sequenced,
    titleById: new Map(rows.map((topic) => [topic.id, topicTitle(topic, locale)])),
    // Ko'rinadigan tartib raqami — yassilangan ro'yxatdagi o'rni (1'dan).
    orderById: new Map(sequenced.map((topic, index) => [topic.id, index + 1])),
  };
}

function Shell({ greeting, children }: { greeting: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Balans ko'rsatkichi ATAYLAB yo'q: u header'dagi `BalanceChip` da,
          yagona manba sifatida. */}
      <h1 className="font-heading text-2xl font-semibold text-ink">{greeting}</h1>
      {children}
    </div>
  );
}
