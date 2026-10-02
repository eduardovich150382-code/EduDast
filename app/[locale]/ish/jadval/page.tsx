import { getTranslations } from "next-intl/server";
import { ScheduleGrid, type ScheduleClass } from "@/components/schedule/schedule-grid";
import { Link } from "@/lib/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";
import { WEEKDAYS } from "@/lib/teaching";

/**
 * "Dars jadvali" — 6 kun x 8 dars to'ri (09-sessiya, 3-band).
 *
 * To'r client komponentda (holat brauzerda), matn serverda tarjima qilinadi.
 */

export default async function JadvalPage() {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Schedule");

  const classes = await prisma.teachingClass.findMany({
    // `deletedAt: null` MAJBURIY (CLAUDE.md soft delete qoidasi).
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ grade: "asc" }, { label: "asc" }],
    select: {
      id: true,
      grade: true,
      label: true,
      lessonsPerWeek: true,
      subject: { select: { nameUz: true, nameUzCyrl: true, nameRu: true } },
      slots: {
        where: { deletedAt: null },
        select: { weekday: true, lessonNo: true },
      },
    },
  });

  const rows: ScheduleClass[] = classes.map((row) => {
    const suffix = row.label ? `${row.grade}-${row.label}` : String(row.grade);
    return {
      id: row.id,
      name: `${subjectName(row.subject, locale)} ${suffix}`,
      shortName: suffix,
      lessonsPerWeek: row.lessonsPerWeek,
    };
  });

  const initialSlots = classes.flatMap((row) =>
    row.slots.map((slot) => ({
      teachingClassId: row.id,
      weekday: slot.weekday,
      lessonNo: slot.lessonNo,
    })),
  );

  // Yorliqlar SERVERDA hisoblanadi: `t()` funksiyasini client komponentga
  // uzatib bo'lmaydi (RSC serializatsiya qilmaydi).
  const weekdays = Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, t(`weekday.${weekday}`)]),
  );
  const weekdaysShort = Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, t(`weekdayShort.${weekday}`)]),
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8 sm:max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="text-sm text-ink-2">{t("description")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-line px-3 py-6 text-center">
          <p className="text-sm text-ink-2">{t("noClasses")}</p>
          <Link
            href="/ish/sinflarim"
            className="inline-flex min-h-11 items-center text-sm text-ink underline-offset-4 hover:underline"
          >
            {t("addClasses")}
          </Link>
        </div>
      ) : (
        <ScheduleGrid
          classes={rows}
          initialSlots={initialSlots}
          labels={{
            save: t("save"),
            saved: t("saved"),
            clear: t("clear"),
            chooseClass: t("chooseClass"),
            close: t("close"),
            prevDay: t("prevDay"),
            nextDay: t("nextDay"),
            // Shablonlar SATR sifatida — client'da almashtiriladi.
            lessonTemplate: t("lesson", { number: "{number}" }),
            mismatchTemplate: t("mismatch", {
              name: "{name}",
              actual: "{actual}",
              expected: "{expected}",
            }),
            weekdays,
            weekdaysShort,
            errors: {
              invalid: t("errors.invalid"),
              topilmadi: t("errors.topilmadi"),
              band: t("errors.band"),
            },
            genericError: t("errors.generic"),
          }}
        />
      )}
    </div>
  );
}
