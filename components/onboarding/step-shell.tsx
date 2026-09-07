import type { ReactNode } from "react";

/**
 * Onboarding'ning 3 qadamiga umumiy qobiq — har biri ALOHIDA to'liq
 * ekran (docs/sessions/02-auth.md, 4-band: "modal emas").
 *
 * Matnlar allaqachon tarjima qilingan holda keladi (server sahifasi
 * `getTranslations` bilan chaqirib beradi) — bu komponent sof taqdimot.
 */
export function StepShell({
  step,
  total,
  stepLabel,
  title,
  description,
  children,
}: {
  step: number;
  total: number;
  stepLabel: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-2">{stepLabel}</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent-2 transition-all"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-2">{description}</p>
      </div>

      {children}
    </div>
  );
}
