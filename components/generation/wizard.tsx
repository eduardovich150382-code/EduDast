import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/generation/wizard-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Sehrgarning umumiy ramkasi: qadam ko'rsatkichi, sarlavha va "Orqaga".
 *
 * SERVER COMPONENT. Butun sehrgar holati URL'da, ya'ni bu yerda hech qanday
 * klient holati yo'q — qadamlar oddiy navigatsiya. Shuning uchun brauzerning
 * "orqaga" tugmasi va ekrandagi "Orqaga" havolasi bir xil ishlaydi, va
 * JavaScript o'chirilgan telefonda ham sehrgar yuradi.
 */

type Props = {
  step: WizardStep;
  title: string;
  description: string;
  /** "Orqaga" havolasi uchun query. `null` — birinchi qadam. */
  backQuery: Record<string, string> | null;
  children: ReactNode;
};

export async function Wizard({
  step,
  title,
  description,
  backQuery,
  children,
}: Props) {
  const t = await getTranslations("Generator");
  const currentIndex = WIZARD_STEPS.indexOf(step);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3">
        {/* Qadam ko'rsatkichi. `<ol>` — bu haqiqatan tartiblangan ro'yxat,
            va ekran o'qigichi "3 dan 2" deb o'qiydi. Bosilmaydigan
            element: oldinga sakrash qadam mashinasida ham rad etiladi
            (`resolveStep`), shuning uchun havola qilish yolg'on bo'lardi. */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {WIZARD_STEPS.map((item, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            return (
              <li
                key={item}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  current && "border-transparent bg-accent text-on-accent",
                  done && "border-line bg-surface text-ink",
                  !current && !done && "border-line text-ink-2",
                )}
              >
                {t(`step.${item}`)}
              </li>
            );
          })}
        </ol>

        <p className="text-xs text-ink-2">
          {t("stepOf", {
            current: currentIndex + 1,
            total: WIZARD_STEPS.length,
          })}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-2">{description}</p>
      </div>

      {children}

      {backQuery !== null && (
        <div>
          <Link
            href={{ pathname: "/ish/yarat", query: backQuery }}
            className={cn(
              buttonVariants({ variant: "ghost", size: "touch" }),
              "px-3",
            )}
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} />
            {t("back")}
          </Link>
        </div>
      )}
    </div>
  );
}
