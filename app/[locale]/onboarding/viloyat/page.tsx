import { getLocale, getTranslations } from "next-intl/server";
import { RegionStep } from "@/components/onboarding/region-step";
import { StepShell } from "@/components/onboarding/step-shell";
import { requireAuth } from "@/lib/auth";
import { redirect } from "@/lib/i18n/navigation";
import { UZ_REGION_CODES, type UzRegionCode } from "@/lib/uz-regions";

function isUzRegionCode(value: string | null): value is UzRegionCode {
  return value !== null && (UZ_REGION_CODES as readonly string[]).includes(value);
}

export default async function OnboardingRegionPage() {
  const user = await requireAuth();
  // Sinflar hali tanlanmagan bo'lsa — bu qadamga URL orqali sakrab
  // o'tishning oldini olish.
  if (user.grades.length === 0) {
    redirect({ href: "/onboarding/sinflar", locale: await getLocale() });
  }

  const t = await getTranslations("Onboarding");

  return (
    <StepShell
      step={3}
      total={3}
      stepLabel={t("step", { current: 3, total: 3 })}
      title={t("region.title")}
      description={t("region.description")}
    >
      <RegionStep
        regions={UZ_REGION_CODES.map((code) => ({ code, name: t(`region.regions.${code}`) }))}
        initialSelected={isUzRegionCode(user.region) ? user.region : null}
        finishLabel={t("region.finish")}
        backLabel={t("region.back")}
        errorLabel={t("genericError")}
      />
    </StepShell>
  );
}
