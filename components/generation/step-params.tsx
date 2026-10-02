import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { DIFFICULTIES, QUESTION_KINDS } from "@/lib/generation/prompts";
import {
  confirmQuery,
  DURATIONS,
  resolveParams,
  toggleKind,
  wizardQuery,
  type WizardParams,
} from "@/lib/generation/wizard-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * 3-qadam: parametrlar.
 *
 * SERVER COMPONENT va har variant `<Link>`. `SelectableChip` ishlatilmadi —
 * u `"use client"` va `onClick` kutadi (`step-type.tsx` dagi izoh).
 *
 * NARX SERVERDAN KELADI: `questionCosts` — `page.tsx` da `creditCost()`
 * bilan hisoblangan jadval. `lib/credits/cost-table` ni bu daraxtga import
 * qilish TAQIQ: formula ikki joyda yashasa, o'qituvchiga ko'rsatilgan narx
 * bilan yechilgan kredit ertami-kechmi farq qilardi.
 */

type Props = {
  params: WizardParams;
  /** Dars ishlanma narxi (bitta son — davomiylikka bog'liq emas). */
  lessonCost: number;
  /** Savol soni -> narx. Serverda hisoblangan. */
  questionCosts: { value: number; cost: number }[];
};

export async function StepParams({ params, lessonCost, questionCosts }: Props) {
  const t = await getTranslations("Generator");
  const resolved = resolveParams(params);
  const isTest = resolved.type === "TEST";

  return (
    <div className="flex flex-col gap-5">
      {isTest ? (
        <>
          <Group label={t("questionCount")}>
            {questionCosts.map((option) => (
              <OptionLink
                key={option.value}
                params={params}
                overrides={{ savol: option.value }}
                selected={resolved.questionCount === option.value}
                label={t("questionCountLabel", { count: option.value })}
                hint={t("cost", { count: option.cost })}
              />
            ))}
          </Group>

          <Group label={t("kindsLabel")}>
            {QUESTION_KINDS.map((kind) => (
              <OptionLink
                key={kind}
                params={params}
                // Ko'p tanlovli: maqsad to'plami SERVERDA hisoblanadi.
                // `toggleKind` bo'sh to'plam qaytarmaydi — `startSchema`
                // dagi `.min(1)` ni buzadigan havola umuman qurilmaydi.
                overrides={{ turlar: toggleKind(resolved.kinds, kind) }}
                selected={resolved.kinds.includes(kind)}
                label={t(`kind.${kind}`)}
              />
            ))}
          </Group>

          <Group label={t("difficultyLabel")}>
            {DIFFICULTIES.map((difficulty) => (
              <OptionLink
                key={difficulty}
                params={params}
                overrides={{ qiyin: difficulty }}
                selected={resolved.difficulty === difficulty}
                label={t(`difficulty.${difficulty}`)}
              />
            ))}
          </Group>
        </>
      ) : (
        <Group label={t("duration")}>
          {DURATIONS.map((minutes) => (
            <OptionLink
              key={minutes}
              params={params}
              overrides={{ daqiqa: minutes }}
              selected={resolved.durationMinutes === minutes}
              label={t("durationLabel", { minutes })}
            />
          ))}
        </Group>
      )}

      {!isTest && (
        <p className="text-sm text-ink-2">{t("cost", { count: lessonCost })}</p>
      )}

      <div>
        {/* "Davom etish" hal qilingan qiymatlarni URL'ga YOZADI — shundan
            keyin qadam mashinasi tasdiqlash qadamiga ruxsat beradi. Ya'ni
            hech narsaga tegmasdan davom etish ham aniq tanlov sifatida
            qayd etiladi va ulashilgan havolada saqlanadi. */}
        <Link
          href={{ pathname: "/ish/yarat", query: confirmQuery(params) }}
          className={buttonVariants({ size: "touch" })}
        >
          {t("next")}
          <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-medium text-ink-2">{label}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OptionLink({
  params,
  overrides,
  selected,
  label,
  hint,
}: {
  params: WizardParams;
  overrides: Parameters<typeof wizardQuery>[1];
  selected: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={{
        pathname: "/ish/yarat",
        // `qadam` o'zgarmaydi: o'qituvchi parametrlarni erkin almashtiradi
        // va har bosishda shu qadamda qoladi.
        query: wizardQuery(params, { ...overrides, qadam: "param" }),
      }}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 flex-col items-start justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-transparent bg-accent text-on-accent"
          : "border-line bg-surface text-ink hover:bg-muted",
      )}
    >
      {label}
      {hint !== undefined && (
        <span className={cn("text-xs", selected ? "opacity-80" : "text-ink-2")}>
          {hint}
        </span>
      )}
    </Link>
  );
}
