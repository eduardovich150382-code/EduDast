import { config } from "dotenv";
import { appBaseUrl } from "../lib/app-url";
import { schoolDay } from "../lib/calendar/placement";
import { positionForClass } from "../lib/calendar/position";
import { flattenTopicTree } from "../lib/calendar/topic-sequence";
import { isAppLocale } from "../lib/i18n/locale-path";
import { routing, type AppLocale } from "../lib/i18n/routing";
import { lessonUrl } from "../lib/reminders/link";
import {
  anchorDayFor,
  planReminders,
  summarizeWeek,
  type ReminderKind,
} from "../lib/reminders/plan";
import { renderReminder } from "../lib/reminders/render";
import { reminderDateFormat, reminderTranslate } from "../lib/reminders/translate";
import { subjectName } from "../lib/subject-name";
import { sendMessage } from "../lib/telegram/api";
import { topicTitle } from "../lib/topic-title";
import { createScriptDb } from "./script-db";

/**
 *   pnpm reminder:test <userId> [kunlik|haftalik]
 *
 * BITTA foydalanuvchiga haqiqiy eslatma yuboradi — skrinshot olish va
 * matnni ko'z bilan ko'rish uchun.
 *
 * NEGA CRON'NI QO'LDA CHAQIRMAYMIZ: hozircha bitta Neon bazasi
 * ishlatiladi (lokal = prod, CLAUDE.md 7-qoida), ya'ni
 * `/api/cron/reminders` ni to'g'ri sir bilan chaqirish eslatmasi
 * tegadigan HAR BIR foydalanuvchiga xabar yuborardi. Shu skript
 * route'ga va uning qorovul mantig'iga umuman TEGMAYDI; route'ga
 * `?userId=` kabi parametr ham ATAYLAB qo'shilmagan — bo'lsa u
 * prodda ochiq teshik bo'lardi.
 *
 * `lastReminderAt` YOZILMAYDI: skriptni ketma-ket bir necha marta
 * chaqirish mumkin bo'lsin (va u kunning "yagona sloti" ni yeb
 * qo'ymasin).
 *
 * Yon foyda: bitta foydalanuvchi uchun ketgan VAQTNI o'lchaydi —
 * `MAX_PER_RUN` ning asosi aynan shu son.
 */

type Db = ReturnType<typeof createScriptDb>;

function parseKind(raw: string | undefined): ReminderKind {
  if (raw === undefined || raw === "kunlik") return "daily";
  if (raw === "haftalik") return "weeklyDigest";
  throw new Error(`Tur "kunlik" yoki "haftalik" bo'lishi kerak (topildi: "${raw}")`);
}

function localeOf(value: string): AppLocale {
  return isAppLocale(value) ? value : routing.defaultLocale;
}

/**
 * `lib/calendar/week-data.ts` dagi `loadTeacherWeek` ning skript
 * nusxasi.
 *
 * NEGA NUSXA: `week-data.ts` `@/lib/db` (global singleton, pooled
 * `DATABASE_URL`) ni import qiladi, skript esa `createScriptDb()`
 * (`DIRECT_URL`) bilan ishlashi kerak — sabab `scripts/script-db.ts`
 * izohida. So'rovlar AYNAN bir xil; mantiq esa (joylashuv va xulosa)
 * baribir sof modullardan keladi, ya'ni ikkilanayotgani faqat
 * so'rovlarning o'zi.
 */
async function loadWeek(db: Db, userId: string, anchorDay: Date, locale: AppLocale) {
  const user = await db.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      telegramId: true,
      locale: true,
      region: true,
      remindersEnabled: true,
      weeklyDigestEnabled: true,
    },
  });

  const [year] = await db.academicYear.findMany({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: {
      quarters: { orderBy: { number: "asc" }, select: { number: true, startsOn: true, endsOn: true } },
      holidays: {
        where: {
          deletedAt: null,
          ...(user.region
            ? { OR: [{ scope: "GLOBAL" as const }, { scope: "REGION" as const, region: user.region }] }
            : { scope: "GLOBAL" as const }),
        },
        select: { startsOn: true, endsOn: true },
      },
    },
  });

  const classRows = await db.teachingClass.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ grade: "asc" }, { label: "asc" }],
    select: {
      id: true,
      grade: true,
      label: true,
      lessonsPerWeek: true,
      topicOffset: true,
      subjectId: true,
      subject: { select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true } },
      slots: { where: { deletedAt: null }, select: { weekday: true } },
      progress: {
        where: { status: "DONE", taughtOn: { not: null } },
        orderBy: { taughtOn: "desc" },
        take: 1,
        select: { topicId: true, taughtOn: true },
      },
    },
  });

  const quarters = year?.quarters ?? [];
  const classes = [];
  for (const row of classRows) {
    const topics = await db.topic.findMany({
      where: { subjectId: row.subjectId, grade: row.grade, deletedAt: null },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      select: {
        id: true,
        parentId: true,
        order: true,
        slug: true,
        quarter: true,
        hoursPlan: true,
        titleUz: true,
        titleUzCyrl: true,
        titleRu: true,
      },
    });
    const anchorRow = row.progress[0];

    classes.push({
      classId: row.id,
      grade: row.grade,
      label: row.label,
      subjectName: subjectName(row.subject, locale),
      subjectSlug: row.subject.slug,
      position: positionForClass({
        quarters,
        holidays: year?.holidays ?? [],
        topics: flattenTopicTree(topics),
        lessonsPerWeek: row.lessonsPerWeek,
        weekdays: row.slots.map((slot) => slot.weekday),
        anchor: anchorRow?.taughtOn
          ? { topicId: anchorRow.topicId, taughtOn: anchorRow.taughtOn }
          : undefined,
        topicOffset: row.topicOffset,
        today: anchorDay,
      }),
      topicTitleById: new Map(topics.map((topic) => [topic.id, topicTitle(topic, locale)])),
    });
  }

  const weekTopicIds = [...new Set(classes.flatMap((entry) => entry.position.weekTopicIds))];
  const documents = weekTopicIds.length
    ? await db.document.findMany({
        where: { userId: user.id, topicId: { in: weekTopicIds }, deletedAt: null, status: "DONE" },
        select: { id: true, topicId: true, type: true },
      })
    : [];

  const docsByTopic = new Map<string, { type: string }[]>();
  for (const doc of documents) {
    const list = docsByTopic.get(doc.topicId);
    if (list) list.push(doc);
    else docsByTopic.set(doc.topicId, [doc]);
  }

  // Chorak `anchorDay` bo'yicha — `teachingWeek` sof, lekin bu yerda
  // bizga faqat raqami kerak.
  const quarter = quarters.find(
    (q) => anchorDay >= schoolDay(q.startsOn) && anchorDay <= schoolDay(q.endsOn),
  );

  return { user, classes, docsByTopic, quarter: quarter?.number ?? null };
}

async function main() {
  config({ path: ".env.local" });

  const userId = process.argv[2];
  if (!userId) {
    throw new Error("Ishlatilishi: pnpm reminder:test <userId> [kunlik|haftalik]");
  }
  const kind = parseKind(process.argv[3]);

  const db = createScriptDb();
  try {
    const now = new Date();
    const anchorDay = anchorDayFor(now);

    const startLoad = Date.now();
    // Til `User.locale` dan — xabar aynan botga ketadigan tilda bo'lsin.
    const probe = await db.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { locale: true },
    });
    const locale = localeOf(probe.locale);
    const week = await loadWeek(db, userId, anchorDay, locale);
    const loadMs = Date.now() - startLoad;

    const summary = summarizeWeek({
      anchorDay,
      inTeachingPeriod: week.quarter !== null,
      quarter: week.quarter,
      classes: week.classes,
      docsByTopic: week.docsByTopic,
    });

    console.log(`Foydalanuvchi: ${week.user.fullName} (${locale})`);
    console.log(
      `Hafta: ${summary.lessonCount} ta dars, ${summary.readyCount} tasiga material tayyor`,
    );
    console.log(`Yuklash: ${loadMs} ms`);

    // `lastReminderAt: null` ATAYLAB: skript kundalik chegaraga
    // tushmasligi kerak, aks holda uni ikkinchi marta chaqirib
    // bo'lmasdi.
    const messages = planReminders({
      kind,
      now,
      users: [
        {
          userId: week.user.id,
          chatId: String(week.user.telegramId),
          locale,
          remindersEnabled: week.user.remindersEnabled,
          weeklyDigestEnabled: week.user.weeklyDigestEnabled,
          lastReminderAt: null,
          week: summary,
        },
      ],
    });

    if (messages.length === 0) {
      console.log(
        `\nXabar YO'Q. Sabablari: eslatma o'chirilgan, ta'til haftasi, ` +
          `materiallar tayyor yoki (kunlik uchun) ertaga dars yo'q.`,
      );
      return;
    }

    const message = messages[0]!;
    const baseUrl = appBaseUrl();
    if (!baseUrl) {
      console.warn("NEXT_PUBLIC_APP_URL sozlanmagan — xabar havolasiz ketadi.");
    }

    const text = renderReminder(message, {
      translate: await reminderTranslate(locale),
      formatDate: reminderDateFormat(locale),
      baseUrl,
      locale,
    });

    console.log(`\n--- yuboriladigan matn (${text.length} belgi) ---\n${text}\n---`);

    const only = message.lessons.length === 1 ? message.lessons[0] : undefined;
    const url = only ? lessonUrl(baseUrl, locale, only) : null;

    const startSend = Date.now();
    const result = await sendMessage(message.chatId, text, {
      replyMarkup: url
        ? { inline_keyboard: [[{ text: "Darsni ochish", url }]] }
        : undefined,
    });
    const sendMs = Date.now() - startSend;

    console.log(`Telegram: ${sendMs} ms`);
    if (result.ok) {
      console.log(`Yuborildi. JAMI bir foydalanuvchi uchun: ${loadMs + sendMs} ms`);
      console.log("`lastReminderAt` ATAYLAB yozilmadi — qayta chaqirish mumkin.");
    } else {
      console.error(`Yuborilmadi (errorCode: ${result.errorCode ?? "yo'q"}).`);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
