import { NotebookPen, ListChecks, Presentation, Gamepad2, Coins } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { prisma } from "@/lib/db";
import { subjectName } from "@/lib/subject-name";

const comingSoonIcons = {
  lessonPlan: NotebookPen,
  test: ListChecks,
  presentation: Presentation,
  game: Gamepad2,
} as const;

export default async function IshPage() {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`
  // orqali natija qayta ishlatiladi) — bu yerdagi `auth()` bazaga qayta
  // bormaydi va foydalanuvchi kafolatlangan holda mavjud.
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Ish");

  const [selectedSubjects, activeSubjects] = await Promise.all([
    prisma.subject.findMany({
      where: { slug: { in: user.subjects } },
      select: { slug: true, isActive: true },
    }),
    prisma.subject.findMany({
      where: { isActive: true },
      select: { nameUz: true, nameUzCyrl: true, nameRu: true },
    }),
  ]);

  const hasInactiveSelection = selectedSubjects.some((subject) => !subject.isActive);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-ink">
          {t("greeting", { name: user.fullName })}
        </h1>
        <div className="flex items-center gap-1.5 text-sm text-ink-2">
          <Coins className="size-4 text-warn" strokeWidth={1.5} />
          <span>
            {t("creditBalance")}: {user.creditBalance}
          </span>
        </div>
      </div>

      {hasInactiveSelection && (
        <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          {t("inactiveSubjectsNotice", {
            activeSubjects: activeSubjects
              .map((subject) => subjectName(subject, locale))
              .join(", "),
          })}
        </p>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink-2">{t("comingSoon.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(comingSoonIcons) as (keyof typeof comingSoonIcons)[]).map((key) => {
            const Icon = comingSoonIcons[key];
            return (
              <Card key={key}>
                <CardHeader>
                  <Icon className="size-5 text-accent" strokeWidth={1.5} />
                  <CardTitle>{t(`comingSoon.${key}`)}</CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
