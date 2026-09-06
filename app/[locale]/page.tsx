import { GraduationCap, NotebookPen, ListChecks, Gamepad2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/locale-switcher";

const featureIcons = {
  lessonPlan: NotebookPen,
  test: ListChecks,
  game: Gamepad2,
} as const;

export default async function HomePage() {
  const t = await getTranslations("HomePage");
  const features = ["lessonPlan", "test", "game"] as const;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink">
          <GraduationCap className="size-6" strokeWidth={1.5} />
          <span className="font-heading text-lg font-semibold">
            {t("title")}
          </span>
        </div>
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 flex-col items-start gap-6">
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
          {t("badge")}
        </span>

        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold text-ink sm:text-4xl">
            {t("tagline")}
          </h1>
          <p className="max-w-xl text-base text-ink-2">{t("description")}</p>
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
