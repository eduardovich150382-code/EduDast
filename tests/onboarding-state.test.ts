import { describe, expect, it } from "vitest";
import {
  isOnboarded,
  nextOnboardingStep,
  type OnboardingSnapshot,
} from "@/lib/auth/onboarding";

/** Onboarding holatini aniqlash mantiqi (docs/sessions/02-auth.md, 6-band). */

function snapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return { subjects: ["fizika"], grades: [7], region: "samarqand", ...overrides };
}

describe("isOnboarded", () => {
  it("uchala maydon to'ldirilgan bo'lsa true", () => {
    expect(isOnboarded(snapshot())).toBe(true);
  });

  it.each([
    ["fanlar bo'sh", { subjects: [] }],
    ["sinflar bo'sh", { grades: [] }],
    ["viloyat null", { region: null }],
    ["viloyat bo'sh satr", { region: "" }],
    ["viloyat faqat bo'shliq", { region: "   " }],
  ])("%s → false", (_nom, overrides) => {
    expect(isOnboarded(snapshot(overrides))).toBe(false);
  });

  it("hech narsa tanlanmagan yangi foydalanuvchi → false", () => {
    expect(isOnboarded({ subjects: [], grades: [], region: null })).toBe(false);
  });

  it("bir nechta fan va sinf ham to'g'ri hisoblanadi", () => {
    expect(
      isOnboarded({
        subjects: ["fizika", "matematika"],
        grades: [7, 8, 9],
        region: "andijon",
      }),
    ).toBe(true);
  });
});

describe("nextOnboardingStep", () => {
  it("yangi foydalanuvchi → 1-qadam", () => {
    expect(nextOnboardingStep({ subjects: [], grades: [], region: null })).toBe(1);
  });

  it("fan tanlangan, sinf yo'q → 2-qadam", () => {
    expect(nextOnboardingStep(snapshot({ grades: [], region: null }))).toBe(2);
  });

  it("fan va sinf bor, viloyat yo'q → 3-qadam", () => {
    expect(nextOnboardingStep(snapshot({ region: null }))).toBe(3);
  });

  it("viloyat faqat bo'shliqdan iborat bo'lsa ham 3-qadam", () => {
    expect(nextOnboardingStep(snapshot({ region: "   " }))).toBe(3);
  });

  it("hammasi to'ldirilgan → null", () => {
    expect(nextOnboardingStep(snapshot())).toBeNull();
  });

  it("null qaytishi isOnboarded=true bilan bir xil ma'noni beradi", () => {
    const cases: OnboardingSnapshot[] = [
      snapshot(),
      snapshot({ subjects: [] }),
      snapshot({ grades: [] }),
      snapshot({ region: "" }),
      { subjects: [], grades: [], region: null },
    ];

    for (const user of cases) {
      expect(nextOnboardingStep(user) === null).toBe(isOnboarded(user));
    }
  });
});
