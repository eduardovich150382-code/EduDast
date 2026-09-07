import { getLocale } from "next-intl/server";
import { isAppLocale } from "./locale-path";
import { routing, type AppLocale } from "./routing";

/**
 * `next-intl/server`'ning `getLocale()` turi oddiy `string` (bu loyihada
 * `use-intl`'ning `Locale` turi kengaytirilmagan), shuning uchun uni
 * `AppLocale` bilan ishlatadigan joylarda (masalan `subjectName()`) toraytirish
 * kerak. Bu server-only helper — `lib/i18n/locale-path.ts` esa ataylab sof
 * qolishi kerak (proxy.ts va testlar undan next-intl/server'siz foydalanadi).
 */
export async function getAppLocale(): Promise<AppLocale> {
  const locale = await getLocale();
  return isAppLocale(locale) ? locale : routing.defaultLocale;
}
