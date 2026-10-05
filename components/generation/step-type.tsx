import { ListChecks, NotebookPen, Presentation } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  wizardQuery,
  type WizardParams,
} from "@/lib/generation/wizard-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * 1-qadam: hujjat turi.
 *
 * Har variant — `<Link>`, ya'ni tanlov URL'ga yoziladi va keyingi qadam
 * oddiy navigatsiya bilan ochiladi. `SelectableChip` ATAYLAB ishlatilmadi:
 * u `"use client"` va `onClick: () => void` kutadi, server componentdan
 * esa funksiya prop uzatish taqiqlangan
 * (`tests/client-props-guard.test.ts`).
 */

const OPTIONS = [
  { param: "dars", icon: NotebookPen, titleKey: "typeLesson", hintKey: "typeLessonHint" },
  { param: "test", icon: ListChecks, titleKey: "typeTest", hintKey: "typeTestHint" },
  { param: "taqdimot", icon: Presentation, titleKey: "typeSlides", hintKey: "typeSlidesHint" },
] as const;

export async function StepType({ params }: { params: WizardParams }) {
  const t = await getTranslations("Generator");

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink">{t("chooseType")}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = params.type === option.param;
          return (
            <Link
              key={option.param}
              href={{
                pathname: "/ish/yarat",
                query: wizardQuery(params, {
                  tur: option.param,
                  qadam: "mavzu",
                }),
              }}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex min-h-11 flex-col gap-1.5 rounded-xl border bg-surface px-4 py-4 transition-colors",
                selected
                  ? "border-accent"
                  : "border-line hover:border-ink-2",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Icon className="size-5 text-accent" strokeWidth={1.5} />
                {t(option.titleKey)}
              </span>
              <span className="text-xs text-ink-2">{t(option.hintKey)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
