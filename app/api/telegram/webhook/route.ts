import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  loginTokenState,
  parseStartCommand,
} from "@/lib/auth/telegram-login";
import { upsertTelegramUser } from "@/lib/auth/upsert-telegram-user";
import { prisma } from "@/lib/db";
import { sendMessage } from "@/lib/telegram/api";
import { isAppLocale } from "@/lib/i18n/locale-path";
import { routing, type AppLocale } from "@/lib/i18n/routing";

/**
 * Telegram bot webhook'i — botning YAGONA kirish nuqtasi.
 *
 * Shu route paydo bo'lgunicha bot hech qanday `/start` ga javob bera
 * olmasdi: `getWebhookInfo` bo'sh edi, ya'ni Telegram yangiliklarni
 * hech qayerga yubormasdi.
 *
 * XAVFSIZLIK: manzilni istalgan kishi topishi mumkin, shuning uchun
 * Telegram'ning `X-Telegram-Bot-Api-Secret-Token` sarlavhasi tekshiriladi
 * (`setWebhook` da `secret_token` bilan qadalgan). Sir sozlanmagan bo'lsa
 * route BUTUNLAY yopiq — "sirsiz ishlayveradi" rejimi ATAYLAB yo'q.
 *
 * JAVOB HAR DOIM 200: Telegram 200 dan boshqa javobni xato deb bilib,
 * o'sha yangilikni qayta-qayta yuboraveradi. Bizdagi xato (masalan baza
 * uzilishi) tufayli navbat tiqilib qolmasligi kerak.
 */

export const dynamic = "force-dynamic";

/** Faqat bizga kerak bo'lgan maydonlar — qolganini zod tashlab yuboradi. */
const updateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({ id: z.number() }),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean(),
          first_name: z.string().min(1),
          last_name: z.string().optional(),
          username: z.string().optional(),
          language_code: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const OK = NextResponse.json({ ok: true });

/**
 * Telegram `language_code` ("uz", "ru", "en"…) → ilova tili. Kirill
 * variantini Telegram ajratmaydi, shuning uchun standart lotin.
 */
function localeFromTelegram(code: string | undefined): AppLocale {
  if (code?.startsWith("ru")) return "ru";
  return routing.defaultLocale;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[telegram/webhook] TELEGRAM_WEBHOOK_SECRET sozlanmagan.");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    // Sirdan hech narsa aytilmaydi, faqat "yo'q".
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return OK;

  const message = parsed.data.message;
  const from = message?.from;
  if (!message || !from || from.is_bot) return OK;

  const start = parseStartCommand(message.text);
  if (!start) return OK;

  try {
    await handleStart({
      chatId: message.chat.id,
      code: start.code,
      from,
      origin: request.nextUrl.origin,
    });
  } catch (error) {
    console.error("[telegram/webhook] /start ishlov berishda xato.", error);
  }

  return OK;
}

async function handleStart(input: {
  chatId: number;
  code: string | null;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  origin: string;
}): Promise<void> {
  const { chatId, code, from, origin } = input;

  // Payloadsiz `/start` — oddiy salomlashuv, saytga havola bilan.
  if (!code) {
    const locale = localeFromTelegram(from.language_code);
    const t = await getTranslations({ locale, namespace: "Bot" });
    await sendMessage(chatId, t("welcome", { url: `${origin}/${locale}/kirish` }));
    return;
  }

  const token = await prisma.loginToken.findUnique({
    where: { code },
    select: {
      id: true,
      locale: true,
      userId: true,
      approvedAt: true,
      consumedAt: true,
      expiresAt: true,
    },
  });

  // Til tokenda saqlangani muhim: foydalanuvchi saytni kirillda ochib,
  // Telegram ilovasi esa ruscha bo'lishi mumkin — javob sayt tilida.
  const locale =
    token && isAppLocale(token.locale)
      ? token.locale
      : localeFromTelegram(from.language_code);
  const t = await getTranslations({ locale, namespace: "Bot" });

  if (!token || loginTokenState(token) === "yaroqsiz") {
    await sendMessage(chatId, t("loginExpired"));
    return;
  }

  const fullName = [from.first_name, from.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");

  const user = await upsertTelegramUser(
    {
      telegramId: BigInt(from.id),
      fullName,
      username: from.username?.trim() || null,
    },
    locale,
  );

  // `approvedAt: null` sharti — bitta tokenni ikki marta tasdiqlab
  // bo'lmaydi (masalan foydalanuvchi "Start" ni ikki marta bossa).
  const approved = await prisma.loginToken.updateMany({
    where: { id: token.id, approvedAt: null, consumedAt: null },
    data: { approvedAt: new Date(), userId: user.id },
  });

  await sendMessage(
    chatId,
    approved.count > 0 ? t("loginApproved") : t("loginAlreadyUsed"),
  );
}
