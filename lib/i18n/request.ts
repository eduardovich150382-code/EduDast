import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Diqqat: bu yerda notFound() CHAQIRILMAYDI. getRequestConfig bitta so'rov
// davomida (metadata, layout, page uchun) bir necha marta ishga tushishi
// mumkin va requestLocale ba'zan vaqtincha undefined bo'lib qoladi — shu
// paytda notFound() chaqirilsa, butun sahifa noto'g'ri 404 qaytaradi.
// Haqiqiy noto'g'ri til segmentini rad etish — app/[locale]/layout.tsx
// dagi hasLocale tekshiruvi zimmasida.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
