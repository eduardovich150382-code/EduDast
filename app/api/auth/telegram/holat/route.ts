import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/cookies";
import { isOnboarded } from "@/lib/auth/onboarding";
import { SESSION_COOKIE, encodeSession } from "@/lib/auth/session";
import {
  LOGIN_VERIFIER_COOKIE,
  LOGIN_VERIFIER_COOKIE_PATH,
  isValidLoginCode,
  loginTokenState,
  verifierMatches,
} from "@/lib/auth/telegram-login";
import { prisma } from "@/lib/db";
import { isAppLocale, localePath } from "@/lib/i18n/locale-path";
import { routing } from "@/lib/i18n/routing";

/**
 * Deep-link login'ning 3-qadami: brauzer shu manzilni so'rab turadi.
 *
 * Bot "Start" ni qabul qilgan bo'lsa — AYNAN SHU javobda sessiya
 * cookie'si qo'yiladi. Ya'ni foydalanuvchi Telegram'ning ichki
 * brauzerida emas, o'zi login boshlagan brauzerda kirgan bo'ladi.
 *
 * Token bir martalik: `consumedAt` shu yerda qo'yiladi va u
 * `updateMany({ consumedAt: null })` sharti bilan atomar bajariladi —
 * ikkita parallel so'rov bitta tokendan ikkita sessiya yasay olmaydi.
 */

export const dynamic = "force-dynamic";

type Holat = "kutilmoqda" | "tayyor" | "yaroqsiz";

function javob(holat: Holat, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ holat, ...extra });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(LOGIN_VERIFIER_COOKIE)?.value;
  if (!raw) return javob("yaroqsiz");

  const separator = raw.indexOf(".");
  if (separator <= 0) return javob("yaroqsiz");

  const code = raw.slice(0, separator);
  const verifier = raw.slice(separator + 1);
  if (!isValidLoginCode(code)) return javob("yaroqsiz");

  const token = await prisma.loginToken.findUnique({
    where: { code },
    select: {
      id: true,
      verifierHash: true,
      locale: true,
      userId: true,
      approvedAt: true,
      consumedAt: true,
      expiresAt: true,
    },
  });

  // Verifier mos kelmasa — `code` to'g'ri bo'lsa ham hech narsa aytilmaydi.
  if (!token || !verifierMatches(verifier, token.verifierHash)) {
    return javob("yaroqsiz");
  }

  const state = loginTokenState(token);
  if (state !== "tayyor") return javob(state);

  const user = await prisma.user.findFirst({
    where: { id: token.userId ?? "", deletedAt: null },
    select: {
      id: true,
      subjects: true,
      grades: true,
      region: true,
      sessionVersion: true,
    },
  });
  if (!user) return javob("yaroqsiz");

  // Atomar "consume": faqat hali ishlatilmagan qatorni belgilaydi.
  const consumed = await prisma.loginToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return javob("yaroqsiz");

  const locale = isAppLocale(token.locale) ? token.locale : routing.defaultLocale;
  const onboarded = isOnboarded(user);

  const response = javob("tayyor", {
    manzil: localePath(locale, onboarded ? "/ish" : "/onboarding"),
  });
  response.cookies.set(
    SESSION_COOKIE,
    await encodeSession({ sub: user.id, onb: onboarded, sv: user.sessionVersion }),
    sessionCookieOptions(),
  );
  // Login cookie'si endi keraksiz — brauzerda qolib ketmasin.
  response.cookies.set(LOGIN_VERIFIER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: LOGIN_VERIFIER_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
