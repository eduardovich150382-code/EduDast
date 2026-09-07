import { getLocale, getTranslations } from "next-intl/server";
import { GradesStep } from "@/components/onboarding/grades-step";
import { StepShell } from "@/components/onboarding/step-shell";
import { requireAuth } from "@/lib/auth";
import { GRADES } from "@/lib/grades";
import { redirect } from "@/lib/i18n/navigation";

export default async function OnboardingGradesPage() {
  const user = await requireAuth();
  // Fanlar hali tanlanmagan bo'lsa — bu qadamga URL orqali sakrab
  // o'tishning oldini olish (docs/sessions/02-auth.md, 4-band tartibi).
  if (user.subjects.length === 0) {
    redirect({ href: "/onboarding/fanlar", locale: await getLocale() });
  }

  const t = await getTranslations("Onboarding");

  return (
    <StepShell
      step={2}
      total={3}
      stepLabel={t("step", { current: 2, total: 3 })}
      title={t("grades.title")}
      description={t("grades.description")}
    >
      <GradesStep
        grades={GRADES}
        initialSelected={user.grades}
        gradeLabel={(grade) => t("grades.gradeLabel", { grade })}
        continueLabel={t("grades.continue")}
        backLabel={t("grades.back")}
        errorLabel={t("genericError")}
      />
    </StepShell>
  );
}
