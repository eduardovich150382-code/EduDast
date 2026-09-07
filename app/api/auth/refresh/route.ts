import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/auth/cookies";
import { isOnboarded } from "@/lib/auth/onboarding";
import { SESSION_COOKIE, encodeSession } from "@/lib/auth/session";
import { localePath, splitLocale } from "@/lib/i18n/locale-path";

/**
 * Eskirgan `onb` uchun qutqaruv yo'li.
 *
 * proxy.ts bazaga bormaydi — `onb` cookie ichida "muzlagan" bit. Agar
 * foydalanuvchi onboarding'ni BOSHQA qurilma/tab'da tugatgan bo'lsa,
 * bu qurilmadagi cookie hali `onb: false` bo'lib qolishi mumkin.
 * Bunday holatda `/onboarding` sahifasi (bazani o'qib, haqiqatni bilgach)
 * shu yerga yo'naltiradi: cookie qayta ishlab chiqariladi va foydalanuvchi
 * `next` ga (yoki `/ish` ga) o'tkaziladi. Bitta qo'shimcha hop, sikl yo'q —
 * chunki `onb: true` bilan `/ish` allow.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await auth();
  const { locale } = splitLocale(request.nextUrl.pathname);

  if (!user) {
    return NextResponse.redirect(
      new URL(localePath(locale, "/kirish"), request.nextUrl.origin),
      303,
    );
  }

  const onboarded = isOnboarded(user);
  const requestedNext = request.nextUrl.searchParams.get("next");
  // Faqat ichki, "/" bilan boshlanuvchi yo'llarga ruxsat — ochiq
  // yo'naltirish (open redirect) bo'lmasligi uchun.
  const next =
    requestedNext && requestedNext.startsWith("/")
      ? requestedNext
      : localePath(locale, onboarded ? "/ish" : "/onboarding");

  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin), 303);
  response.cookies.set(
    SESSION_COOKIE,
    await encodeSession({ sub: user.id, onb: onboarded, sv: user.sessionVersion }),
    sessionCookieOptions(),
  );
  return response;
}
