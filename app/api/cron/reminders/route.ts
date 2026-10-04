import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { loadActiveYear, loadTeacherWeek, type ActiveYear, type TopicPack } from "@/lib/calendar/week-data";
import { prisma } from "@/lib/db";
import { isAppLocale } from "@/lib/i18n/locale-path";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { lessonUrl } from "@/lib/reminders/link";
import {
  anchorDayFor,
  planReminders,
  summarizeWeek,
  type ReminderKind,
  type ReminderUser,
} from "@/lib/reminders/plan";
import { renderReminder } from "@/lib/reminders/render";
import { reminderDateFormat, reminderTranslate } from "@/lib/reminders/translate";
import { sendMessage } from "@/lib/telegram/api";

/**
 * Eslatma yuboruvchi cron (docs/sessions/12-eslatmalar.md, 4-band).
 *
 * IKKI JADVAL, BITTA ROUTE — turi `?tur=` query'sidan keladi
 * (`vercel.json`). Soatdan aniqlash ZAXIRASI ATAYLAB YO'Q: zaxira
 * ikkinchi haqiqat manbai bo'lib, aynan konfiguratsiya xatosini jimgina
 * yashirardi — jadval o'zgarsa yoki query tushib qolsa route noto'g'ri
 * turni yuborardi va buni hech kim bilmasdi. Ochiq yiqilish (400) afzal.
 *
 * Naqsh `app/api/cron/stale-documents/route.ts` dan.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bir yugurishda nechta foydalanuvchi.
 *
 * 50 — O'LCHANGAN SON EMAS, ehtiyotkor baho. `maxDuration = 60` QATTIQ
 * chegara va uzilish JIMGINA bo'ladi: bir qism foydalanuvchi xabar
 * oladi, qolgani yo'q va buni hech kim bilmaydi. Ketma-ket 200 ta uchun
 * baho `200 x (Neon ~40ms x2 + Telegram ~200ms) ~ 56-80s` — chegaraning
 * aynan ustida. Haqiqiy vaqt `pnpm reminder:test` bilan o'lchanadi.
 */
const MAX_PER_RUN = 50;

/** Telegram ~30 xabar/soniya ko'taradi; 5 xavfsiz va 60s ga sig'adi. */
const SEND_CONCURRENCY = 5;

/** Bot bloklangan / chat topilmadi — xabar HECH QACHON yetmaydi. */
const BLOCKED_CODES = new Set([403]);

/** `app/api/cron/embeddings/route.ts` dagi bilan bir xil sabab va mantiq. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function localeOf(value: string): AppLocale {
  // `User.locale` — `String`, ya'ni eski yoki buzilgan qator bo'lishi
  // mumkin. Toraytirilmasa `createTranslator` cron ichida yiqilardi.
  return isAppLocale(value) ? value : routing.defaultLocale;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Sir sozlanmagan bo'lsa endpoint BUTUNLAY YOPIQ: ochiq qolsa har kim
  // hamma o'qituvchiga xabar yuborishni qo'zg'ata olardi.
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET sozlanmagan" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!secretMatches(token, secret)) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 401 });
  }

  const tur = request.nextUrl.searchParams.get("tur");
  if (tur !== "kunlik" && tur !== "haftalik") {
    // 400 — ATAYLAB, qolgan javoblar 200. Bu konfiguratsiya xatosi va
    // KO'RINISHI kerak; ish paytidagi xato esa Vercel'ni qayta urinishga
    // undamasligi uchun 200 ichida qaytadi.
    console.error(`[cron/reminders] noma'lum tur: ${tur ?? "yo'q"}`);
    return NextResponse.json({ ok: false, error: "tur noto'g'ri" }, { status: 400 });
  }
  const kind: ReminderKind = tur === "haftalik" ? "weeklyDigest" : "daily";

  const now = new Date();
  const anchorDay = anchorDayFor(now);
  const baseUrl = appBaseUrl();
  if (!baseUrl) {
    // Xabar baribir yuboriladi, faqat havolasiz — lekin bu sozlama
    // xatosi va bir marta ko'rinishi kerak.
    console.warn("[cron/reminders] NEXT_PUBLIC_APP_URL sozlanmagan — xabar havolasiz ketadi.");
  }

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let planned = 0;
  let candidates = 0;
  let errorKind: string | null = null;

  try {
    const rows = await prisma.user.findMany({
      where: { deletedAt: null, remindersEnabled: true },
      // Tugamagan yugurish xabar OLMAGANLARNI keyingi martaga BIRINCHI
      // qoldiradi (`@@index([remindersEnabled, lastReminderAt])`).
      orderBy: [{ lastReminderAt: "asc" }, { id: "asc" }],
      take: MAX_PER_RUN,
      select: {
        id: true,
        telegramId: true,
        locale: true,
        region: true,
        remindersEnabled: true,
        weeklyDigestEnabled: true,
        lastReminderAt: true,
      },
    });
    candidates = rows.length;

    if (candidates === MAX_PER_RUN) {
      // CHEGARAGA TEGILDI — jim qolmaydi. Aks holda foydalanuvchi soni
      // oshganda eslatmalar "har kuni" dan "ikki kunda bir" ga jimgina
      // siljirdi va buni hech narsa aytmasdi.
      console.warn(
        `[cron/reminders] chegara to'ldi (${MAX_PER_RUN}) — qolgani keyingi yugurishda. ` +
          `MAX_PER_RUN ni ko'tarish kerak.`,
      );
    }

    // Ikki kesh — bir foydalanuvchida ko'rinmaydi, 50 tada halokat:
    // ta'til filtri viloyatga bog'liq (~14 viloyat, 50 emas), mavzular
    // esa `(subjectId, grade, locale)` ga (ko'pchilik `fizika, 7` ni
    // bo'lishadi).
    const yearByRegion = new Map<string, ActiveYear | null>();
    const topicCache = new Map<string, TopicPack>();

    const users: ReminderUser[] = [];
    for (const row of rows) {
      const locale = localeOf(row.locale);
      const regionKey = row.region ?? "GLOBAL";
      if (!yearByRegion.has(regionKey)) {
        yearByRegion.set(regionKey, await loadActiveYear(row.region));
      }
      const year = yearByRegion.get(regionKey)!;

      const week = await loadTeacherWeek(
        { id: row.id, region: row.region, locale },
        { anchorDay, year, topicCache },
      );

      users.push({
        userId: row.id,
        // BigInt sof modulga kirmaydi — chegarada satrga aylanadi.
        chatId: String(row.telegramId),
        locale,
        remindersEnabled: row.remindersEnabled,
        weeklyDigestEnabled: row.weeklyDigestEnabled,
        lastReminderAt: row.lastReminderAt,
        week: summarizeWeek({
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
        }),
      });
    }

    const messages = planReminders({ kind, now, users });
    planned = messages.length;

    // Kichik konkurensiya bilan bo'laklab — ketma-ket yuborish 60s ga
    // sig'masdi, cheksiz parallel esa Telegram limitiga urardi.
    for (let i = 0; i < messages.length; i += SEND_CONCURRENCY) {
      const chunk = messages.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (message) => {
          // HAR XABAR ALOHIDA: bitta foydalanuvchining xatosi bo'lakni
          // ham, cron'ni ham yiqitmasin.
          try {
            const translate = await reminderTranslate(message.locale);
            const text = renderReminder(message, {
              translate,
              formatDate: reminderDateFormat(message.locale),
              baseUrl,
              locale: message.locale,
            });

            // Bitta dars bo'lsa inline tugma — ko'p bo'lsa havolalar
            // qatorlarda, tugma qaysi darsga olib borishi noaniq bo'lardi.
            const only = message.lessons.length === 1 ? message.lessons[0] : undefined;
            const url = only ? lessonUrl(baseUrl, message.locale, only) : null;

            return {
              userId: message.userId,
              result: await sendMessage(message.chatId, text, {
                replyMarkup: url
                  ? { inline_keyboard: [[{ text: translate("Reminders.open"), url }]] }
                  : undefined,
              }),
            };
          } catch (error) {
            console.error(
              "[cron/reminders] xabar tayyorlanmadi",
              error instanceof Error ? error.name : "unknown",
            );
            return { userId: message.userId, result: { ok: false as const } };
          }
        }),
      );

      for (const { userId, result } of results) {
        if (result.ok) {
          sent += 1;
          // FAQAT MUVAFFAQIYATDAN KEYIN: Telegram yiqilsa kunning
          // yagona slotini yeb qo'ymasin.
          await prisma.user.update({ where: { id: userId }, data: { lastReminderAt: new Date() } });
          continue;
        }

        failed += 1;
        if (result.errorCode !== undefined && BLOCKED_CODES.has(result.errorCode)) {
          // Xabar hech qachon yetmaydi — qayta urinishdan ma'no yo'q.
          blocked += 1;
          await prisma.user.update({ where: { id: userId }, data: { remindersEnabled: false } });
        }
      }
    }
  } catch (error) {
    errorKind = error instanceof Error ? error.name : "unknown";
    console.error("[cron/reminders] yiqildi", error);
  }

  // Xato bo'lsa ham HTTP 200: 5xx da Vercel Cron qayta uradi va yiqilgan
  // bazaga/Telegram'ga qayta-qayta uriladi. Holat javob tanasida.
  return NextResponse.json({
    ok: errorKind === null,
    kind,
    candidates,
    planned,
    sent,
    failed,
    blocked,
    errorKind,
  });
}
