import { getTranslations } from "next-intl/server";
import { SubjectsStep } from "@/components/onboarding/subjects-step";
import { StepShell } from "@/components/onboarding/step-shell";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";

export default async function OnboardingSubjectsPage() {
  const user = await requireAuth();
  const locale = await getAppLocale();
  const t = await getTranslations("Onboarding");

  const subjects = await prisma.subject.findMany({
    orderBy: [{ isActive: "desc" }, { slug: "asc" }],
    select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true, isActive: true },
  });

  return (
    <StepShell
      step={1}
      total={3}
      stepLabel={t("step", { current: 1, total: 3 })}
      title={t("subjects.title")}
      description={t("subjects.description")}
    >
      <SubjectsStep
        subjects={subjects.map((subject) => ({
          slug: subject.slug,
          name: subjectName(subject, locale),
          isActive: subject.isActive,
        }))}
        initialSelected={user.subjects}
        continueLabel={t("subjects.continue")}
        comingSoonLabel={t("subjects.comingSoon")}
        emptyLabel={t("subjects.empty")}
        errorLabel={t("genericError")}
      />
    </StepShell>
  );
}
