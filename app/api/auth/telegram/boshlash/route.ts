import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeBotUsername } from "@/lib/auth/telegram";
import {
  LOGIN_TOKEN_MAX_AGE_SECONDS,
  LOGIN_VERIFIER_COOKIE,
  LOGIN_VERIFIER_COOKIE_PATH,
  buildDeepLink,
  createLoginCode,
  createLoginVerifier,
  hashVerifier,
} from "@/lib/auth/telegram-login";
import { prisma } from "@/lib/db";
import { routing } from "@/lib/i18n/routing";

/**
 * Deep-link login'ning 1-qadami: bir martalik token yaratiladi va brauzerga
 * `t.me/<bot>?start=<code>` havolasi qaytariladi.
 *
 * NEGA POST: bu yozuv amali (bazada qator yaratadi va cookie qo'yadi),
 * ya'ni GET bo'lsa har prefetch yoki link-preview yangi token yasab
 * ketardi.
 *
 * Cookie ichida IKKALASI ham — `code.verifier`. Shu sabab holat so'rovi
 * hech qanday query parametrisiz ishlaydi va `code` brauzerdagi JS ga
 * umuman ko'rinmaydi (httpOnly).
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  locale: z.enum(routing.locales),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const botUsername = normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  if (!botUsername) {
    console.error("[auth/telegram] TELEGRAM_BOT_USERNAME sozlanmagan.");
    return NextResponse.json({ xato: "sozlanmagan" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ xato: "invalid_payload" }, { status: 400 });
  }

  const code = createLoginCode();
  const verifier = createLoginVerifier();
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_MAX_AGE_SECONDS * 1000);

  await prisma.loginToken.create({
    data: {
      code,
      verifierHash: hashVerifier(verifier),
      locale: parsed.data.locale,
      expiresAt,
    },
  });

  const response = NextResponse.json({ deepLink: buildDeepLink(botUsername, code) });
  response.cookies.set(LOGIN_VERIFIER_COOKIE, `${code}.${verifier}`, {
    httpOnly: true,
    // Sessiya cookie'sidagi kabi: `localhost` da `Secure` cookie jimgina
    // tashlanadi, ya'ni qat'iy `true` dev oqimini o'ldirardi.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: LOGIN_VERIFIER_COOKIE_PATH,
    maxAge: LOGIN_TOKEN_MAX_AGE_SECONDS,
  });
  return response;
}
