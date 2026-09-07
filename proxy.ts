import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decideRouteAccess } from "@/lib/auth/route-guards";
import { localePath, splitLocale } from "@/lib/i18n/locale-path";
import { routing } from "@/lib/i18n/routing";
import { PROXY_MATCHER } from "@/lib/proxy-matcher";

/**
 * Next.js 16'da `middleware.ts` deprecated va `proxy.ts` ga qayta
 * nomlangan (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md). Proxy standart holda Node.js runtime'da
 * ishlaydi va `runtime` sozlamasini qabul qilmaydi.
 *
 * Bu yerda ikki narsa birlashadi: next-intl'ning til marshrutlashi va
 * bizning auth qorovulimiz. Tartib muhim — til normalizatsiyasi birinchi.
 *
 * DIQQAT: proxy — MARSHRUTLASH, himoya emas. Haqiqiy chegara
 * `requireAuth()` / `requireOnboarded()` va server action'lar boshidagi
 * tekshiruv (lib/auth/index.ts). Matcher xato yozilsa himoya jimgina
 * yo'qoladi — quyidagi izohga qarang.
 */

const handleI18n = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const intlResponse = handleI18n(request);

  // 1. next-intl o'zi yo'naltirsa ("/" → "/uz", noto'g'ri prefiksni
  //    tuzatish) — o'sha javob tegilmasdan qaytadi. Auth keyingi so'rovda
  //    baribir qayta baholanadi.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // 2. Shu nuqtada `localePrefix: "always"` tufayli birinchi segment
  //    kafolatlangan haqiqiy til kodi.
  const { locale, rest } = splitLocale(request.nextUrl.pathname);

  // 3. Sessiya faqat cookie'dan o'qiladi — bazaga BORILMAYDI. Proxy har
  //    navigatsiyada (RSC prefetch ham) ishlaydi, Neon round-trip bu yerda
  //    har havolaga 50–150ms qo'shardi. Shuning uchun `onb` JWT ichida.
  //    `sessionVersion` esa auth() da, ya'ni haqiqiy chegarada tekshiriladi.
  const session = await decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  const decision = decideRouteAccess({
    pathname: rest,
    isAuthed: session !== null,
    isOnboarded: session?.onb === true,
  });

  // 4. Ruxsat berilsa — AYNAN o'sha intl javobi qaytadi, ya'ni rewrite
  //    sarlavhalari, alternate-links va Set-Cookie butun qoladi.
  if (decision.kind === "allow") {
    return intlResponse;
  }

  // 5. Yo'naltirishda `NextResponse.next()` ni redirect'ga aylantirib
  //    bo'lmaydi, shuning uchun yangi javob yasaladi va intl qo'ygan
  //    cookie'lar (NEXT_LOCALE) unga ko'chiriladi — aks holda birinchi
  //    tashrifdagi til tanlovi yo'qoladi.
  const url = request.nextUrl.clone();
  url.pathname = localePath(locale, decision.to);
  url.search = "";

  const redirect = NextResponse.redirect(url);
  for (const cookie of intlResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  // "/api", "/_next", "/_vercel" va nuqtali (fayl) yo'llarni chetlab o'tadi.
  // Shablonning o'zi lib/proxy-matcher.ts da — u yerda nega alohida turgani
  // va qanday xatodan saqlanayotgani izohlangan.
  matcher: PROXY_MATCHER,
};
