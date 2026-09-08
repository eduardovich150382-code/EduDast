import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/cookies";
import { isOnboarded } from "@/lib/auth/onboarding";
import { SESSION_COOKIE, encodeSession } from "@/lib/auth/session";
import { normalizeBotToken, verifyTelegramAuth } from "@/lib/auth/telegram";
import { prisma } from "@/lib/db";
import { isAppLocale, localePath } from "@/lib/i18n/locale-path";
import { routing } from "@/lib/i18n/routing";

/**
 * Telegram Login Widget callback'i.
 *
 * Widget `data-auth-url` bilan sozlangan (`data-onauth` emas): brauzer shu
 * yerga to'liq sahifa GET'i bilan keladi, biz esa bitta javobda tekshirib,
 * cookie qo'yib, yo'naltiramiz. Auth yo'lida birinchi tomon JS umuman yo'q.
 *
 * TIL NEGA YO'LDA, `?locale=uz` DA EMAS:
 * Telegram data-check-string'ga `hash` dan boshqa BARCHA query
 * parametrlarni qo'shadi. Oldindan qo'yilgan `?locale=uz` ham imzoga
 * kirib ketardi va HAR BIR hash yiqilardi. `NEXT_LOCALE` cookie'si esa
 * bu yerda o'qilmaydi — next-intl uni `Path` siz qo'yadi, ya'ni brauzer
 * uni `/uz` ga bog'laydi va `/api/...` ga yubormaydi. Shuning uchun til
 * yo'l segmentida, query satri esa 100% Telegram'niki bo'lib qoladi.
 * BotFather faqat DOMENNI qadaydi, yo'lni emas — bu bepul.
 */

// Har so'rovda tekshiruv bo'lishi shart, keshlanmasin.
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale: rawLocale } = await ctx.params;
  const locale = isAppLocale(rawLocale) ? rawLocale : routing.defaultLocale;

  const fail = (reason: string) => {
    const url = new URL(localePath(locale, "/kirish"), request.nextUrl.origin);
    url.searchParams.set("xato", reason);
    return NextResponse.redirect(url, 303);
  };

  const botToken = normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) {
    // Token yo'qligi — sozlash xatosi. Xabarda token haqida hech narsa yo'q.
    console.error("[auth/telegram] TELEGRAM_BOT_TOKEN sozlanmagan.");
    return fail("sozlanmagan");
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = verifyTelegramAuth(params, { botToken });

  if (!result.ok) {
    // FAQAT `result.reason` log qilinadi — u yopiq literal union.
    // `params` log qilinmaydi (ichida hash bor), token esa umuman yo'q.
    console.warn(`[auth/telegram] rad etildi: ${result.reason}`);
    return fail(result.reason);
  }

  const { telegramId, fullName, username } = result.data;

  const user = await prisma.user.upsert({
    where: { telegramId },
    // `locale` faqat yaratishda qo'yiladi — keyinchalik foydalanuvchi
    // tilni almashtirsa, qayta kirish uni bekor qilib yubormasligi kerak.
    create: { telegramId, fullName, username, locale },
    // Rasm (photo_url) SAQLANMAYDI — R2 hali sozlanmagan va kerak ham emas.
    update: { fullName, username },
    select: {
      id: true,
      subjects: true,
      grades: true,
      region: true,
      sessionVersion: true,
    },
  });

  const onboarded = isOnboarded(user);
  const target = localePath(locale, onboarded ? "/ish" : "/onboarding");

  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
  response.cookies.set(
    SESSION_COOKIE,
    await encodeSession({ sub: user.id, onb: onboarded, sv: user.sessionVersion }),
    sessionCookieOptions(),
  );
  return response;
}
