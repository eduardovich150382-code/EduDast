import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  loginTokenState,
  parseStartCommand,
} from "@/lib/auth/telegram-login";
import { upsertTelegramUser } from "@/lib/auth/upsert-telegram-user";
import { appBaseUrl } from "@/lib/app-url";
import { schoolDay } from "@/lib/calendar/placement";
import { loadTeacherWeek } from "@/lib/calendar/week-data";
import { prisma } from "@/lib/db";
import { anchorDayFor, summarizeWeek, type ReminderLesson } from "@/lib/reminders/plan";
import { renderReminder, renderToday } from "@/lib/reminders/render";
import { reminderDateFormat, reminderTranslate } from "@/lib/reminders/translate";
import { sendMessage } from "@/lib/telegram/api";
import { looksLikeCommand, parseBotCommand, type BotCommand } from "@/lib/telegram/commands";
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
  if (start) {
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

  const command = parseBotCommand(message.text);
  if (command) {
    try {
      await handleCommand({
        command,
        chatId: message.chat.id,
        telegramId: BigInt(from.id),
        fallbackLocale: localeFromTelegram(from.language_code),
        origin: request.nextUrl.origin,
      });
    } catch (error) {
      // `/start` bilan bir xil intizom: xato logga tushadi, javob 200.
      console.error(`[telegram/webhook] /${command} ishlov berishda xato.`, error);
    }
    return OK;
  }

  // Noma'lum BUYRUQ ("/xyz") ga javob beramiz, oddiy matnga esa YO'Q:
  // o'qituvchi botga shunchaki yozganida "buyruqni bilmayman" deyish
  // bezovta qilardi.
  if (looksLikeCommand(message.text)) {
    try {
      const locale = localeFromTelegram(from.language_code);
      const translate = await getTranslations({ locale, namespace: "Bot" });
      await sendMessage(message.chat.id, translate("unknownCommand"));
    } catch (error) {
      console.error("[telegram/webhook] noma'lum buyruqqa javob berilmadi.", error);
    }
  }

  return OK;
}

/**
 * `/bugun`, `/hafta`, `/eslatma`.
 *
 * Foydalanuvchi `telegramId` bo'yicha topiladi — botda sessiya cookie'si
 * yo'q, ya'ni `auth()` ishlamaydi. Topilmasa saytga havola bilan
 * "avval kiring" deyiladi (yangi akkaunt YARATILMAYDI: akkaunt faqat
 * `/start` dagi tasdiqlangan login oqimida ochiladi).
 */
async function handleCommand(input: {
  command: BotCommand;
  chatId: number;
  telegramId: bigint;
  fallbackLocale: AppLocale;
  origin: string;
}): Promise<void> {
  const { command, chatId, telegramId, origin } = input;

  const user = await prisma.user.findFirst({
    where: { telegramId, deletedAt: null },
    select: {
      id: true,
      locale: true,
      region: true,
      remindersEnabled: true,
      weeklyDigestEnabled: true,
    },
  });

  if (!user) {
    const translate = await getTranslations({
      locale: input.fallbackLocale,
      namespace: "Bot",
    });
    await sendMessage(chatId, translate("notLinked", { url: `${origin}/${input.fallbackLocale}/kirish` }));
    return;
  }

  // Til SAYT sozlamasidan (`User.locale`), Telegram ilovasi tilidan EMAS:
  // o'qituvchi saytni kirillda ishlatib, Telegram'i ruscha bo'lishi mumkin.
  const locale = isAppLocale(user.locale) ? user.locale : input.fallbackLocale;
  const translateBot = await getTranslations({ locale, namespace: "Bot" });

  if (command === "eslatma") {
    const next = !user.remindersEnabled;
    await prisma.user.update({ where: { id: user.id }, data: { remindersEnabled: next } });
    await sendMessage(
      chatId,
      next
        ? translateBot("remindersOn")
        : `${translateBot("remindersOff")}\n${origin}/${locale}/ish/sozlamalar`,
    );
    return;
  }

  // `/hafta` anchori — ERTANGI kun, cron'dagi xulosa bilan AYNI.
  // `schoolDay(new Date())` AYNI tuzoqqa tushardi: yakshanba ISO 7, ya'ni
  // oyna tugayotgan haftani berardi va o'qituvchi yakshanba kechqurun
  // `/hafta` yozsa O'TGAN haftasini ko'rardi. Ertangi kun esa har doim
  // joriy yoki kelayotgan haftada, shuning uchun shart kerak emas.
  // `/bugun` esa chindan bugun.
  const now = new Date();
  const anchorDay = command === "hafta" ? anchorDayFor(now) : schoolDay(now);

  const week = await loadTeacherWeek({ id: user.id, region: user.region, locale }, { anchorDay });
  const summary = summarizeWeek({
    anchorDay,
    inTeachingPeriod: week.period !== null,
    quarter: week.period?.quarter ?? null,
    classes: week.classes.map((entry) => ({
      classId: entry.row.id,
      grade: entry.row.grade,
      label: entry.row.label,
      subjectName: entry.row.subjectName,
      subjectSlug: entry.row.subjectSlug,
      position: entry.position,
      topicTitleById: entry.titleById,
    })),
    docsByTopic: week.docsByTopic,
  });

  const context = {
    translate: await reminderTranslate(locale),
    formatDate: reminderDateFormat(locale),
    baseUrl: appBaseUrl() ?? origin,
    locale,
  };

  if (command === "bugun") {
    const today = summary.lessons.filter(
      (lesson: ReminderLesson) =>
        lesson.date !== null && lesson.date.getTime() === anchorDay.getTime(),
    );
    await sendMessage(
      chatId,
      today.length === 0 ? translateBot("todayNone") : renderToday(today, context),
    );
    return;
  }

  if (summary.lessons.length === 0) {
    await sendMessage(chatId, translateBot("weekNone"));
    return;
  }

  await sendMessage(
    chatId,
    renderReminder(
      {
        userId: user.id,
        chatId: String(chatId),
        locale,
        kind: "weeklyDigest",
        lessons: summary.lessons,
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        lessonCount: summary.lessonCount,
        readyCount: summary.readyCount,
      },
      context,
    ),
  );
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
