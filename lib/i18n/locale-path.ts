import { routing, type AppLocale } from "./routing";

/**
 * Yo'ldagi til prefiksi bilan ishlash. `proxy.ts` uchun kerak: u yerda
 * next-intl'ning ichki `x-next-intl-locale` sarlavhasiga tayanib bo'lmaydi
 * (u `x-middleware-request-*` ichida yashiringan hujjatlashtirilmagan
 * mexanizm), shuning uchun locale yo'lning birinchi segmentidan olinadi.
 *
 * Bu ishonchli, chunki routing'da `localePrefix: "always"` — prefikssiz
 * yo'l next-intl tomonidan allaqachon yo'naltirilgan bo'ladi.
 *
 * `next-intl`ning `hasLocale()` si ATAYLAB ishlatilmadi: bu modul sof
 * qolishi kerak (React'siz, har so'rovda proxy'da ishlaydi).
 */

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * "/uz-Cyrl/ish/abc" → { locale: "uz-Cyrl", rest: "/ish/abc" }
 * "/uz"              → { locale: "uz", rest: "/" }
 * "/xx/ish"          → { locale: "uz" (standart), rest: "/xx/ish" }
 */
export function splitLocale(pathname: string): { locale: AppLocale; rest: string } {
  const segments = pathname.split("/");
  const first = segments[1] ?? "";

  if (!isAppLocale(first)) {
    return { locale: routing.defaultLocale, rest: pathname || "/" };
  }

  const rest = segments.slice(2).join("/");
  return { locale: first, rest: rest ? `/${rest}` : "/" };
}

/** ("ru", "/ish") → "/ru/ish"; ("uz", "/") → "/uz" */
export function localePath(locale: AppLocale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
