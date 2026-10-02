import { getTranslations } from "next-intl/server";
import { ClassesManager, type ClassRow } from "@/components/classes/classes-manager";
import { Link } from "@/lib/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { CLASS_LABELS } from "@/lib/teaching";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";

/**
 * "Sinflarim" — o'qituvchining sinflari (09-sessiya, 2-band).
 *
 * Ro'yxat va forma client komponentda, chunki tahrirlash holati brauzerda
 * turadi. Barcha matn SERVERDA tarjima qilinib prop sifatida uzatiladi
 * (`tests/client-props-guard.test.ts` qorovuli).
 */

export default async function SinflarimPage() {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Classes");

  const [subjects, classes] = await Promise.all([
    prisma.subject.findMany({
      where: { slug: { in: user.subjects } },
      orderBy: { slug: "asc" },
      select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true },
    }),
    prisma.teachingClass.findMany({
      // `deletedAt: null` MAJBURIY (CLAUDE.md soft delete qoidasi).
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ grade: "asc" }, { label: "asc" }],
      select: {
        id: true,
        grade: true,
        label: true,
        lessonsPerWeek: true,
        subject: { select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true } },
      },
    }),
  ]);

  const rows: ClassRow[] = classes.map((row) => ({
    id: row.id,
    subjectSlug: row.subject.slug,
    subjectName: subjectName(row.subject, locale),
    grade: row.grade,
    label: row.label,
    lessonsPerWeek: row.lessonsPerWeek,
  }));

  const subjectOptions = subjects.map((item) => ({
    value: item.slug,
    label: subjectName(item, locale),
  }));
  const gradeOptions = GRADES.filter((grade) => user.grades.includes(grade)).map((grade) => ({
    value: grade,
    label: t("gradeLabel", { grade }),
  }));
  // `CLASS_LABELS` — `lib/teaching.ts` dagi yopiq ro'yxat, ya'ni forma va Zod
  // validatsiyasi bitta manbadan. "" uchun alohida matn ("Harfsiz").
  const letterOptions = CLASS_LABELS.map((letter) => ({
    value: letter,
    label: letter === "" ? t("letterNone") : letter,
  }));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="text-sm text-ink-2">{t("description")}</p>
      </div>

      {subjectOptions.length === 0 || gradeOptions.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
          {t("noSubjects")}
        </p>
      ) : (
        <>
          <ClassesManager
            classes={rows}
            subjects={subjectOptions}
            grades={gradeOptions}
            letters={letterOptions}
            labels={{
              add: t("add"),
              subject: t("subject"),
              grade: t("grade"),
              letter: t("letter"),
              lessonsPerWeek: t("lessonsPerWeek"),
              save: t("save"),
              cancel: t("cancel"),
              edit: t("edit"),
              delete: t("delete"),
              empty: t("empty"),
              // Shablon SATR sifatida uzatiladi — client'da `{count}`
              // almashtiriladi. Funksiya uzatib bo'lmaydi (RSC).
              hoursTemplate: t("hours", { count: "{count}" }),
              errors: {
                invalid: t("errors.invalid"),
                topilmadi: t("errors.topilmadi"),
                ruxsat: t("errors.ruxsat"),
                band: t("errors.band"),
              },
              genericError: t("errors.generic"),
            }}
          />

          {rows.length > 0 && (
            <Link
              href="/ish/jadval"
              className="inline-flex min-h-11 items-center justify-center text-center text-sm text-ink-2 underline-offset-4 hover:underline"
            >
              {t("scheduleLink")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
