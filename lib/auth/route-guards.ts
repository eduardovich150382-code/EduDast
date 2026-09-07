/**
 * Marshrut ruxsati — sof qaror funksiyasi. DB ham, cookie ham, Next ham
 * yo'q: `proxy.ts` faqat kirish ma'lumotlarini yig'ib, natijani bajaradi.
 * Shu ajratish tufayli butun jadval oddiy unit test bilan qoplanadi.
 *
 * DIQQAT: bu MARSHRUTLASH, himoya emas. Haqiqiy chegara —
 * `requireAuth()` / `requireOnboarded()` (lib/auth/index.ts) va har bir
 * server action boshidagi tekshiruv. Proxy matcher'i xato yozilsa
 * (bu repo'da bir marta shunday bo'lgan) himoya jimgina yo'qoladi.
 */

export type GuardTarget = "/kirish" | "/onboarding" | "/ish";

export type GuardDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: GuardTarget };

type RouteArea = "public" | "kirish" | "onboarding" | "ish";

const ALLOW: GuardDecision = { kind: "allow" };

/** "/ishxona" — "/ish" EMAS: segment chegarasi hisobga olinadi. */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function routeArea(pathname: string): RouteArea {
  if (isUnder(pathname, "/kirish")) return "kirish";
  if (isUnder(pathname, "/onboarding")) return "onboarding";
  if (isUnder(pathname, "/ish")) return "ish";
  return "public";
}

/**
 * `pathname` — til prefiksi OLIB TASHLANGAN yo'l ("/ish/abc"), chunki
 * qaror tildan mustaqil.
 *
 * | yo'l          | anonim      | kirgan, onb yo'q | kirgan, onb bor |
 * |---------------|-------------|------------------|-----------------|
 * | /             | allow       | allow            | allow           |
 * | /kirish       | allow       | -> /onboarding   | -> /ish         |
 * | /onboarding*  | -> /kirish  | allow            | -> /ish         |
 * | /ish*         | -> /kirish  | -> /onboarding   | allow           |
 * | boshqa        | allow       | allow            | allow           |
 *
 * Sikl bo'lishi mumkin emas: har yo'naltirish manzili o'sha holatda
 * `allow` (tests/route-guards.test.ts buni alohida tekshiradi).
 */
export function decideRouteAccess(input: {
  pathname: string;
  isAuthed: boolean;
  isOnboarded: boolean;
}): GuardDecision {
  const { isAuthed, isOnboarded } = input;
  const area = routeArea(input.pathname);

  if (area === "public") return ALLOW;

  if (area === "kirish") {
    if (!isAuthed) return ALLOW;
    return { kind: "redirect", to: isOnboarded ? "/ish" : "/onboarding" };
  }

  if (!isAuthed) return { kind: "redirect", to: "/kirish" };

  if (area === "onboarding") {
    return isOnboarded ? { kind: "redirect", to: "/ish" } : ALLOW;
  }

  // area === "ish"
  return isOnboarded ? ALLOW : { kind: "redirect", to: "/onboarding" };
}
