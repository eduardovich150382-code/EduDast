import { positionForClass, teachingWeek, type ClassPosition } from "@/lib/calendar/position";
import { flattenTopicTree } from "@/lib/calendar/topic-sequence";
import {
  type PlacementHoliday,
  type PlacementQuarter,
  type PlacementTopic,
} from "@/lib/calendar/placement";
import { prisma } from "@/lib/db";
import { subjectName } from "@/lib/subject-name";
import { topicTitle } from "@/lib/topic-title";
import type { AppLocale } from "@/lib/i18n/routing";

/**
 * "Bitta o'qituvchining bir haftasi" — YUKLOVCHI (IO) qatlam.
 *
 * NEGA ALOHIDA MODUL: aynan shu so'rovlar ketma-ketligi uchta joyga kerak
 * bo'ldi — bosh sahifa (`app/[locale]/ish/page.tsx`), eslatma cron'i va
 * bot buyruqlari (`/bugun`, `/hafta`). Ilgari u sahifa ichida inline
 * turardi, ya'ni cron uni qayta yozishga majbur bo'lardi va ikki nusxa
 * vaqt o'tib jimgina ajralib ketardi.
 *
 * NEGA `lib/reminders/` DA EMAS: mavzusi o'quv haftasi, eslatma emas.
 * Bosh sahifaga ham, `/bugun` ga ham eslatma tushunchasisiz kerak.
 *
 * TOZALIK CHEGARASI: bu modul bazaga boradi, lekin HISOB QILMAYDI —
 * joylashuv `lib/calendar/position.ts` da, xulosa `lib/reminders/plan.ts`
 * da, ikkisi ham sof. Shu yerda faqat so'rovlar va ularning keshi.
 *
 * `locale` — MAJBURIY PARAMETR, `getAppLocale()` ATAYLAB chaqirilmaydi:
 * cron kontekstida so'rov tili yo'q, har foydalanuvchining `User.locale` i
 * ishlatiladi.
 */

/** Faol o'quv yilining `placement.ts` ga kerakli qismi. */
export type ActiveYear = {
  quarters: PlacementQuarter[];
  holidays: PlacementHoliday[];
};

/** Bitta `(subjectId, grade, locale)` uchun kurikulum to'plami. */
export type TopicPack = {
  /** `flattenTopicTree()` natijasi — GLOBAL `order` bilan. */
  sequenced: PlacementTopic[];
  titleById: Map<string, string>;
  /** Ko'rinadigan tartib raqami — yassilangan ro'yxatdagi o'rni (1'dan). */
  orderById: Map<string, number>;
};

export type TeachingClassRow = {
  id: string;
  grade: number;
  label: string;
  lessonsPerWeek: number;
  topicOffset: number;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  weekdays: number[];
  anchor?: { topicId: string; taughtOn: Date };
};

export type TeacherWeekClass = {
  row: TeachingClassRow;
  position: ClassPosition;
  titleById: Map<string, string>;
  orderById: Map<string, number>;
};

export type TeacherWeekViewer = {
  id: string;
  region: string | null;
  locale: AppLocale;
};

export type TeacherWeekOptions = {
  /**
   * Oyna shu kunni o'z ichiga olgan ISO haftadan olinadi.
   *
   * Sahifa `schoolDay(new Date())` beradi; eslatma yo'li esa
   * `anchorDayFor(now)` — ERTANGI kun.
   *
   * DIQQAT — ANCHOR ERTANGI KUN BO'LGANDA: `position.currentTopicId`,
   * `todayTopicId`, `tomorrowTopicId`, `previousTopicId`, `nextTopicId` va
   * `days[].past` o'sha anchorga NISBATAN hisoblanadi, ya'ni "bugun" dan
   * emas. Eslatma yo'li shu sababli ulardan HECH BIRINI o'qimaydi — faqat
   * `mode`, `days`, `weekTopicIds`, `weekStart/End`. Bosh sahifa esa
   * anchorni bugunga qo'yadi va hammasini ishlatishda davom etadi.
   */
  anchorDay: Date;
  /**
   * Faol yil oldindan yuklangan bo'lsa. Cron 50 foydalanuvchini aylanganda
   * uni VILOYAT bo'yicha keshlab shu yerga uzatadi — ta'til filtri
   * `user.region` ga bog'liq, ya'ni har viloyat uchun bittadan so'rov
   * yetarli (50 emas).
   */
  year?: ActiveYear | null;
  /**
   * `${subjectId}:${grade}:${locale}` -> TopicPack. Cron butun yugurish
   * bo'ylab bitta keshni uzatadi — partiyadagi ko'pchilik o'qituvchi bir
   * xil `(fizika, 7)` ni bo'lishadi.
   */
  topicCache?: Map<string, TopicPack>;
};

export type TeacherWeek = {
  anchorDay: Date;
  year: ActiveYear | null;
  /** `teachingWeek(quarters, anchorDay)` — `null` bo'lsa ta'til/yoz. */
  period: { quarter: number; week: number } | null;
  classes: TeacherWeekClass[];
  docsByTopic: Map<string, { id: string; type: string }[]>;
};

/**
 * Faol o'quv yili: choraklar va (viloyat bo'yicha filtrlangan) ta'tillar.
 *
 * `findFirst` YETARLI EMAS: xato UPDATE ikkita faol yil qoldirsa u
 * tasodifiy birini olib jimgina noto'g'ri reja berardi.
 *
 * Viloyat filtri SO'ROVDA: `placement.ts` sof funksiya, u tayyor ta'til
 * ro'yxatini oladi.
 */
export async function loadActiveYear(region: string | null): Promise<ActiveYear | null> {
  const [year] = await prisma.academicYear.findMany({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: {
      quarters: {
        orderBy: { number: "asc" },
        select: { number: true, startsOn: true, endsOn: true },
      },
      holidays: {
        where: {
          deletedAt: null,
          ...(region
            ? {
                OR: [
                  { scope: "GLOBAL" as const },
                  { scope: "REGION" as const, region },
                ],
              }
            : { scope: "GLOBAL" as const }),
        },
        select: { startsOn: true, endsOn: true },
      },
    },
  });

  return year ?? null;
}

/** Sinf kurikulumi: yassilangan ketma-ketlik + ko'rinadigan nom va tartib. */
export async function loadTopicPack(
  subjectId: string,
  grade: number,
  locale: AppLocale,
): Promise<TopicPack> {
  const rows = await prisma.topic.findMany({
    where: { subjectId, grade, deletedAt: null },
    // `slug` ikkinchi mezon SHART — CSV'da `order` takrorlanadi va Postgres
    // teng qiymatlarda tartibni kafolatlamaydi.
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

  const sequenced = flattenTopicTree(rows);
  return {
    sequenced,
    titleById: new Map(rows.map((topic) => [topic.id, topicTitle(topic, locale)])),
    orderById: new Map(sequenced.map((topic, index) => [topic.id, index + 1])),
  };
}

/**
 * O'qituvchining sinflari + har biri uchun joriy hafta holati + o'sha
 * haftadagi mavzular uchun TAYYOR hujjatlar.
 *
 * MATERIALLAR `Document` dan `userId + topicId` bo'yicha olinadi.
 * `LessonPlan` ATAYLAB ishlatilmaydi — qarz `docs/qarzlar-kechiktirilgan.md`
 * da.
 */
export async function loadTeacherWeek(
  viewer: TeacherWeekViewer,
  options: TeacherWeekOptions,
): Promise<TeacherWeek> {
  const { anchorDay } = options;
  const year = options.year !== undefined ? options.year : await loadActiveYear(viewer.region);

  const classRows = await prisma.teachingClass.findMany({
    // `deletedAt: null` MAJBURIY (CLAUDE.md soft delete qoidasi).
    where: { userId: viewer.id, deletedAt: null },
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
        // Anchor — eng oxirgi o'tilgan mavzu (`@@index([teachingClassId, taughtOn])`).
        where: { status: "DONE", taughtOn: { not: null } },
        orderBy: { taughtOn: "desc" },
        take: 1,
        select: { topicId: true, taughtOn: true },
      },
    },
  });

  const quarters = year?.quarters ?? [];
  const period = teachingWeek(quarters, anchorDay);

  if (classRows.length === 0) {
    return { anchorDay, year, period, classes: [], docsByTopic: new Map() };
  }

  const rows: TeachingClassRow[] = classRows.map((row) => {
    const anchorRow = row.progress[0];
    return {
      id: row.id,
      grade: row.grade,
      label: row.label,
      lessonsPerWeek: row.lessonsPerWeek,
      topicOffset: row.topicOffset,
      subjectId: row.subjectId,
      subjectSlug: row.subject.slug,
      subjectName: subjectName(row.subject, viewer.locale),
      weekdays: row.slots.map((slot) => slot.weekday),
      anchor: anchorRow?.taughtOn
        ? { topicId: anchorRow.topicId, taughtOn: anchorRow.taughtOn }
        : undefined,
    };
  });

  // Mavzular (subjectId, grade) juftligi bo'yicha BIR MARTA olinadi — 7-A va
  // 7-B bir xil kurikulumga tayanadi, ikki marta so'rash bekorchilik.
  const cache = options.topicCache ?? new Map<string, TopicPack>();
  const keyOf = (row: TeachingClassRow) => `${row.subjectId}:${row.grade}:${viewer.locale}`;
  const missing = [...new Set(rows.map(keyOf))].filter((key) => !cache.has(key));
  await Promise.all(
    missing.map(async (key) => {
      const [subjectId, grade] = key.split(":");
      cache.set(key, await loadTopicPack(subjectId!, Number(grade), viewer.locale));
    }),
  );

  const classes: TeacherWeekClass[] = rows.map((row) => {
    const pack = cache.get(keyOf(row))!;
    return {
      row,
      titleById: pack.titleById,
      orderById: pack.orderById,
      position: positionForClass({
        quarters,
        holidays: year?.holidays ?? [],
        topics: pack.sequenced,
        lessonsPerWeek: row.lessonsPerWeek,
        weekdays: row.weekdays,
        anchor: row.anchor,
        topicOffset: row.topicOffset,
        today: anchorDay,
      }),
    };
  });

  // Materiallar: haftadagi HAMMA mavzu uchun BITTA so'rov (N+1 bo'lmasin).
  const weekTopicIds = [...new Set(classes.flatMap(({ position }) => position.weekTopicIds))];
  const documents = weekTopicIds.length
    ? await prisma.document.findMany({
        where: {
          userId: viewer.id,
          topicId: { in: weekTopicIds },
          deletedAt: null,
          status: "DONE",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, topicId: true, type: true },
      })
    : [];

  const docsByTopic = new Map<string, { id: string; type: string }[]>();
  for (const doc of documents) {
    const list = docsByTopic.get(doc.topicId);
    if (list) list.push(doc);
    else docsByTopic.set(doc.topicId, [doc]);
  }

  return { anchorDay, year, period, classes, docsByTopic };
}
