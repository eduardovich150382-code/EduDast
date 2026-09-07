/**
 * Onboarding holatini aniqlash. Sof mantiq — DB ham, Next ham yo'q,
 * shuning uchun proxy'da ham, server komponentda ham, testda ham bir xil.
 */

export type OnboardingSnapshot = {
  subjects: string[];
  grades: number[];
  region: string | null;
};

/**
 * CHEKINISH (ataylab): docs/sessions/02-auth.md da gate "subjects bo'sh"
 * deb yozilgan, bu yerda esa uchala maydon ham talab qilinadi.
 *
 * Bu aniq superset — subjects bo'sh bo'lsa baribir `false` qaytadi, ya'ni
 * vazifadagi shart buzilmaydi. Sabab: 1-qadamdan keyin chiqib ketgan
 * foydalanuvchi aks holda `/ish` ga sinfsiz va viloyatsiz tushib qolardi,
 * keyingi sessiyalardagi generatorlar esa shu ma'lumotlarga tayanadi.
 */
export function isOnboarded(user: OnboardingSnapshot): boolean {
  return (
    user.subjects.length > 0 &&
    user.grades.length > 0 &&
    (user.region ?? "").trim().length > 0
  );
}

/**
 * Foydalanuvchi to'xtab qolgan qadam raqami, tugagan bo'lsa `null`.
 * Yarim yo'lda chiqib ketgan odam qayta kirganda aynan shu qadamdan
 * davom etadi (02-auth.md, 4-band).
 */
export function nextOnboardingStep(user: OnboardingSnapshot): 1 | 2 | 3 | null {
  if (user.subjects.length === 0) return 1;
  if (user.grades.length === 0) return 2;
  if ((user.region ?? "").trim().length === 0) return 3;
  return null;
}
