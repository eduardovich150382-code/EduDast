import { getLocale } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { nextOnboardingStep } from "@/lib/auth/onboarding";
import { redirect } from "@/lib/i18n/navigation";

const STEP_PATH = {
  1: "/onboarding/fanlar",
  2: "/onboarding/sinflar",
  3: "/onboarding/viloyat",
} as const;

/**
 * `/onboarding` ning o'zi — foydalanuvchi to'xtab qolgan qadamga
 * yo'naltiradi (yoki uchalasi ham to'ldirilgan bo'lsa /ish ga).
 */
export default async function OnboardingIndexPage() {
  const user = await requireAuth();
  const locale = await getLocale();
  const step = nextOnboardingStep(user);

  redirect({ href: step ? STEP_PATH[step] : "/ish", locale });
}
