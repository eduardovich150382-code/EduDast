import { CalendarPlus, Plus, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TopicShift } from "@/components/week/topic-shift";
import { auth } from "@/lib/auth";
import { schoolDay } from "@/lib/calendar/placement";
import { loadTeacherWeek, type TeachingClassRow } from "@/lib/calendar/week-data";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { Link } from "@/lib/i18n/navigation";
import { lessonQuery, type LinkableLesson } from "@/lib/reminders/link";
import { summarizeWeek } from "@/lib/reminders/plan";

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
 * SO'ROVLAR `lib/calendar/week-data.ts` da (12-sessiya): aynan shu ketma-ketlik
 * eslatma cron'i va bot buyruqlariga ham kerak bo'ldi, sahifa ichida qolsa
 * ikki nusxa vaqt o'tib jimgina ajralib ketardi.
 */

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

  // Anchor BUGUN — sahifa "hozir qaysi mavzudamiz" ni ko'rsatadi, ya'ni
  // `position` ning `todayTopicId` / `past` kabi maydonlari ham to'g'ri
  // ma'noda bo'ladi (eslatma yo'li esa anchorni ERTAGA qo'yadi, batafsil
  // `week-data.ts` dagi `anchorDay` izohida).
  const week = await loadTeacherWeek(
    { id: user.id, region: user.region, locale },
    { anchorDay: schoolDay(new Date()) },
  );
  const { classes: positions, docsByTopic, period } = week;
  const quarters = week.year?.quarters ?? [];

  // SINF YO'Q — onboarding'dagi tanlovdan foydalanib taklif beramiz.
  if (positions.length === 0) {
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

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    // UTC — sana shartnomasi (`placement.ts`). Mahalliy mintaqada sana bir
    // kunga siljib ko'rinardi.
    timeZone: "UTC",
  });

  // Hisob `lib/reminders/plan.ts` da — eslatma bilan BITTA manbadan.
  //
  // DIQQAT, XATTI-HARAKAT O'ZGARDI: ilgari "tayyor" ISTALGAN `DONE`
  // hujjat edi (`docsByTopic.has(id)`), endi `FULLY_READY_TYPES`
  // (hozircha `LESSON_PLAN`). Ikki ta'rif bo'lsa o'qituvchi shu
  // sahifada darsni "tayyor" deb ko'rib, keyin o'sha dars uchun eslatma
  // olib chalkashardi — pastdagi `nextGap` qatori bilan esa bu
  // qarama-qarshilik ekranning o'zida ko'rinib qolardi.
  const summary = summarizeWeek({
    anchorDay: week.anchorDay,
    inTeachingPeriod: period !== null,
    quarter: period?.quarter ?? null,
    classes: positions.map((entry) => ({
      classId: entry.row.id,
      grade: entry.row.grade,
      label: entry.row.label,
      subjectName: entry.row.subjectName,
      subjectSlug: entry.row.subjectSlug,
      position: entry.position,
      topicTitleById: entry.titleById,
    })),
    docsByTopic,
  });

  const { lessonCount, readyCount } = summary;

  // Birinchi TAYYOR BO'LMAGAN dars — "Chorshanbadagi 7-A fizika darsiga
  // hali hech narsa yo'q." `summarizeWeek` darvozasiz, ya'ni bu qator
  // `remindersEnabled = false` da ham, bugun xabar ketgandan keyin ham
  // ko'rinadi (`planReminders` ishlatilsa matn cron vaqtiga qarab
  // o'zgarib turardi).
  const gap = summary.lessons.find((lesson) => lesson.ready !== "full");

  /** Sinf nomi: "Fizika 7-A" yoki harfsiz "Fizika 7". */
  function className(row: { subjectName: string; grade: number; label: string }): string {
    return row.label
      ? t("classLabel", { subject: row.subjectName, grade: row.grade, letter: row.label })
      : t("classLabelNoLetter", { subject: row.subjectName, grade: row.grade });
  }

  /**
   * Query `lib/reminders/link.ts` dagi `lessonQuery` bilan AYNI
   * manbadan: sahifa va Telegram xabaridagi havola bir-biridan ajralib
   * ketsa, botdan bosilgan havola sehrgarni bo'sh holatda ochib
   * qo'yardi.
   */
  function prepareHref(lesson: LinkableLesson) {
    return {
      pathname: "/ish/yarat" as const,
      query: Object.fromEntries(lessonQuery(lesson)),
    };
  }

  /** `TeachingClassRow` + mavzu -> havola uchun minimal shakl. */
  function linkable(row: TeachingClassRow, topicId: string): LinkableLesson {
    return {
      subjectSlug: row.subjectSlug,
      grade: row.grade,
      quarter: period?.quarter ?? null,
      topicId,
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
          <Link href={prepareHref(linkable(entry.row, topicId))} className={PREPARE_BUTTON}>
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

        {/* Eng muhim bitta ish — bosilsa to'g'ridan o'sha darsga olib
            boradi. Kuni yo'q sinf (jadval kiritilmagan) uchun kunsiz
            variant: "Chorshanbadagi" deyish mumkin emas, kun aniq emas. */}
        {gap && (
          <Link
            href={prepareHref(gap)}
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            {gap.weekday === null
              ? t("nextGapNoDay", { class: className(gap) })
              : t("nextGap", {
                  day: t(`weekday.${gap.weekday}`),
                  class: className(gap),
                })}
          </Link>
        )}
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
