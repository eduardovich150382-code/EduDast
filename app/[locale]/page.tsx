import { CalendarDays, GraduationCap, ListChecks, NotebookPen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/lib/i18n/navigation";

/**
 * Bosh sahifa (landing).
 *
 * `features.game` -> `features.plan`: sinf o'yinlari hali yo'q, haftalik
 * reja esa 09-sessiyada yetkazilgan. "Tez orada" belgisi ham olib
 * tashlandi — mahsulot ishlayotganda u foydalanuvchini kutishga undaydi.
 */

const featureIcons = {
  lessonPlan: NotebookPen,
  test: ListChecks,
  plan: CalendarDays,
} as const;

export default async function HomePage() {
  const t = await getTranslations("HomePage");
  const features = ["lessonPlan", "test", "plan"] as const;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink">
          <GraduationCap className="size-6" strokeWidth={1.5} />
          <span className="font-heading text-lg font-semibold">
            {t("title")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-start gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold text-ink sm:text-4xl">
            {t("tagline")}
          </h1>
          <p className="max-w-xl text-base text-ink-2">{t("description")}</p>
        </div>

        {/* Oldin `/kirish` ga BIRORTA havola yo'q edi — foydalanuvchi
            manzilni qo'lda yozishi kerak edi (hujjatning 6-bandi). */}
        <div className="flex flex-col gap-1.5">
          <Link href="/kirish" className={buttonVariants({ size: "touch" })}>
            {t("cta")}
          </Link>
          <span className="text-xs text-ink-2">{t("ctaNote")}</span>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-3">
          {features.map((feature) => {
            const Icon = featureIcons[feature];
            return (
              <Card key={feature}>
                <CardHeader>
                  <Icon
                    className="size-5 text-accent"
                    strokeWidth={1.5}
                  />
                  <CardTitle>{t(`features.${feature}.title`)}</CardTitle>
                  <CardDescription>
                    {t(`features.${feature}.description`)}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
