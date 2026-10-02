import { dayNumber, dayToDate, isoWeekday, schoolDay } from "@/lib/calendar/placement";
import type { ClassPosition } from "@/lib/calendar/position";
import type { AppLocale } from "@/lib/i18n/routing";

/**
 * "Kimga, qanday xabar yuborilsin" — SOF modul
 * (docs/sessions/12-eslatmalar.md, 2-band).
 *
 * Bazaga bormaydi, argumentsiz `new Date()` chaqirmaydi (`placement.ts` va
 * `position.ts` bilan bir xil shartnoma). Kun matematikasi QAYTA
 * YOZILMAGAN — `placement.ts` dan import qilinadi.
 *
 * IKKI QATLAM, ataylab:
 *
 * 1. `summarizeWeek()` — DARVOZASIZ, bitta o'qituvchi. "Bu haftada nima
 *    bor va nimasi tayyor." Bosh sahifadagi qator SHUNDAN o'qiydi.
 * 2. `planReminders()` — DARVOZALI, ro'yxat oladi. "Hozir kimga xabar
 *    ketishi kerak." Faqat cron va test skripti ishlatadi.
 *
 * NEGA QATOR 1-QATLAMDAN O'QIYDI: qator `remindersEnabled = false`
 * bo'lganda ham, bugun xabar yuborilgandan keyin ham ko'rinishi kerak.
 * `lastReminderAt` ga bog'lansa sahifadagi matn cron vaqtiga qarab
 * o'zgarib turardi — bu xato, imkoniyat emas. Shu sababli bitta
 * foydalanuvchilik `planForUser` o'rovchisi ATAYLAB eksport qilinmaydi:
 * u qatorni darvozali yo'lga tortardi.
 */

/**
 * `DocumentType` enumining nusxasi. Sof modul Prisma'ni (va u orqali
 * generatsiya qilingan klientni) ATAYLAB import qilmaydi.
 */
export type ReminderDocType = "LESSON_PLAN" | "TEST" | "CROSSWORD" | "SLIDES" | "GUIDE";

/** Ko'rsatish tartibi — `Week.materials.*` yorliqlari shu tartibda chiqadi. */
export const DOC_TYPE_ORDER: readonly ReminderDocType[] = [
  "LESSON_PLAN",
  "TEST",
  "SLIDES",
  "CROSSWORD",
  "GUIDE",
];

export type ReminderKind = "daily" | "weeklyDigest";

export type ReadyState = "none" | "partial" | "full";

/**
 * "MATERIALLARI TO'LIQ TAYYOR" ta'rifi — BITTA joyda.
 *
 * Qaror: dars ishlanma bo'lsa dars o'tiladi, qolgani (test, taqdimot,
 * krossvord, qo'llanma) ixtiyoriy qo'shimcha. Hammasini talab qilish
 * o'qituvchini cheksiz bezovta qilardi.
 *
 * Bu MAHSULOT qarori va o'zgarishi mumkin, shuning uchun eksport
 * qilingan konstanta; `summarizeWeek` esa `requiredTypes` parametrini
 * oladi, ya'ni testlar siyosatni konstantani qotirmasdan qadaydi.
 */
export const FULLY_READY_TYPES: readonly ReminderDocType[] = ["LESSON_PLAN"];

/** Bitta dars = (sinf, mavzu, kun). Tig'izlangan kunda ikki qator bo'ladi. */
export type ReminderLesson = {
  classId: string;
  topicId: string;
  topicTitle: string;
  subjectName: string;
  /** Chuqur havolaning `fan=` qismi. */
  subjectSlug: string;
  grade: number;
  /** "A" yoki "" (harfsiz sinf) — `TeachingClass.label` bilan bir xil. */
  label: string;
  /** ISO hafta kuni 1..7. `null` — `mode: "week"` (jadval kiritilmagan). */
  weekday: number | null;
  /** UTC yarim kecha. `null` — `mode: "week"`. */
  date: Date | null;
  /** Chuqur havolaning `chorak=` qismi. `null` bo'lsa parametr tushadi. */
  quarter: number | null;
  /** Tayyor (DONE) hujjat turlari, `DOC_TYPE_ORDER` bo'yicha, takrorsiz. */
  readyTypes: ReminderDocType[];
  /** `requiredTypes` dan yo'qlari. */
  missingTypes: ReminderDocType[];
  ready: ReadyState;
};

export type WeekSummary = {
  /** Oynaning dushanbasi va yakshanbasi (UTC yarim kecha). */
  weekStart: Date;
  weekEnd: Date;
  /**
   * `teachingWeek(...) !== null` — faqat UI YORLIG'I ("Ta'til") uchun.
   * Xabar yuborish DARVOZASI EMAS (pastdagi 4-darvoza izohiga qarang).
   */
  inTeachingPeriod: boolean;
  quarter: number | null;
  lessons: ReminderLesson[];
  lessonCount: number;
  /** `ready === "full"` bo'lgan darslar soni. */
  readyCount: number;
};

/** `summarizeWeek` ga beriladigan bitta sinf. */
export type ClassWeekInput = {
  classId: string;
  grade: number;
  label: string;
  subjectName: string;
  subjectSlug: string;
  /** `positionForClass()` natijasining kerakli qismi. */
  position: Pick<ClassPosition, "mode" | "weekStart" | "weekEnd" | "days" | "weekTopicIds">;
  topicTitleById: ReadonlyMap<string, string>;
};

export type SummarizeWeekInput = {
  /** Oyna shu kunni o'z ichiga olgan haftadan — sinflar bo'sh bo'lsa ham. */
  anchorDay: Date;
  inTeachingPeriod: boolean;
  quarter: number | null;
  classes: ClassWeekInput[];
  docsByTopic: ReadonlyMap<string, ReadonlyArray<{ type: string }>>;
  requiredTypes?: readonly ReminderDocType[];
};

/**
 * Mavjud hujjat turlariga qarab darsning tayyorlik holati.
 *
 * `none` — hech narsa yo'q; `full` — `required` ning HAMMASI bor;
 * `partial` — biror narsa bor, lekin hammasi emas.
 */
export function readyStateFor(
  present: readonly ReminderDocType[],
  required: readonly ReminderDocType[] = FULLY_READY_TYPES,
): ReadyState {
  if (present.length === 0) return "none";
  const has = new Set(present);
  return required.every((type) => has.has(type)) ? "full" : "partial";
}

function isDocType(value: string): value is ReminderDocType {
  return (DOC_TYPE_ORDER as readonly string[]).includes(value);
}

/** Saralash: kun (jadvalsizlar oxirida) -> sinf -> harf. */
function compareLessons(a: ReminderLesson, b: ReminderLesson): number {
  const dayA = a.weekday ?? 8;
  const dayB = b.weekday ?? 8;
  if (dayA !== dayB) return dayA - dayB;
  if (a.grade !== b.grade) return a.grade - b.grade;
  return a.label.localeCompare(b.label);
}

export function summarizeWeek(input: SummarizeWeekInput): WeekSummary {
  const required = input.requiredTypes ?? FULLY_READY_TYPES;
  const lessons: ReminderLesson[] = [];

  for (const entry of input.classes) {
    const base = {
      classId: entry.classId,
      subjectName: entry.subjectName,
      subjectSlug: entry.subjectSlug,
      grade: entry.grade,
      label: entry.label,
      quarter: input.quarter,
    };

    const build = (topicId: string, weekday: number | null, date: Date | null) => {
      const docs = input.docsByTopic.get(topicId) ?? [];
      const present = new Set<ReminderDocType>();
      for (const doc of docs) if (isDocType(doc.type)) present.add(doc.type);

      const readyTypes = DOC_TYPE_ORDER.filter((type) => present.has(type));
      const missingTypes = required.filter((type) => !present.has(type));

      lessons.push({
        ...base,
        topicId,
        topicTitle: entry.topicTitleById.get(topicId) ?? topicId,
        weekday,
        date,
        readyTypes,
        missingTypes,
        ready: readyStateFor(readyTypes, required),
      });
    };

    if (entry.position.mode === "days") {
      for (const day of entry.position.days) {
        for (const topicId of day.topicIds) build(topicId, day.weekday, day.date);
      }
      continue;
    }

    // JADVAL YO'Q: kun aniqlanmaydi (qaysi kun tanlangani tasodifiy —
    // `position.ts` ning o'z cheklovi), shuning uchun `weekday`/`date`
    // `null`. Kunlik eslatmaga bunday dars STRUKTURA BO'YICHA tushmaydi.
    for (const topicId of entry.position.weekTopicIds) build(topicId, null, null);
  }

  lessons.sort(compareLessons);

  // Oyna: sinf bo'lsa uning oynasi (hammasida bir xil, `anchorDay` dan
  // hisoblanadi), bo'lmasa `anchorDay` ning o'zidan quriladi. Kun
  // matematikasi `placement.ts` dan — bu yerda QAYTA YOZILMAYDI.
  const first = input.classes[0]?.position;
  const anchor = dayNumber(input.anchorDay);
  const weekStartDay = anchor - (isoWeekday(anchor) - 1);

  return {
    weekStart: first?.weekStart ?? dayToDate(weekStartDay),
    weekEnd: first?.weekEnd ?? dayToDate(weekStartDay + 6),
    inTeachingPeriod: input.inTeachingPeriod,
    quarter: input.quarter,
    lessons,
    lessonCount: lessons.length,
    readyCount: lessons.filter((lesson) => lesson.ready === "full").length,
  };
}

export type ReminderUser = {
  userId: string;
  /** `String(user.telegramId)` — BigInt sof modulga KIRMAYDI. */
  chatId: string;
  locale: AppLocale;
  remindersEnabled: boolean;
  weeklyDigestEnabled: boolean;
  lastReminderAt: Date | null;
  week: WeekSummary;
};

export type ReminderMessage = {
  userId: string;
  chatId: string;
  locale: AppLocale;
  kind: ReminderKind;
  /** daily: faqat ERTANGI, tayyor bo'lmagan darslar. digest: hammasi. */
  lessons: ReminderLesson[];
  weekStart: Date;
  weekEnd: Date;
  /** Xulosa qatori uchun — haftaning TO'LIQ soni, filtrlangan emas. */
  lessonCount: number;
  readyCount: number;
};

export type ReminderPlanInput = {
  /** Cron route'ining `?tur=` query'sidan — modul soatga QARAMAYDI. */
  kind: ReminderKind;
  /** FAQAT "bugun qaysi kun" uchun. */
  now: Date;
  users: ReminderUser[];
};

/**
 * Xabar TEGISHLI bo'lgan haftani anchorlaydi: ikkala tur uchun ham
 * ERTANGI kun.
 *
 * NEGA ERTAGA — ENG EHTIMOLLI JIMGINA XATO SHU YERDA:
 * `positionForClass` oynasini `weekStartDay = todayDay - (isoWeekday - 1)`
 * dan quradi. Yakshanba ISO hisobda 7, ya'ni `today = yakshanba` TUGAYOTGAN
 * haftani beradi. Yakshanba 18:00 da `schoolDay(now)` bilan qurilgan
 * xulosa o'qituvchiga allaqachon o'tilgan mavzularni ko'rsatardi.
 *
 * Ertangi kun esa ikkala holda ham to'g'ri:
 * - yakshanba -> dushanba -> KELAYOTGAN hafta (xulosa shuni ko'rsatadi);
 * - boshqa kun -> ertaga o'sha haftada, ya'ni oyna o'zgarmaydi, lekin
 *   ertangi kun HAR DOIM oyna ichida bo'ladi va `position.days` da uning
 *   TO'LIQ `topicIds` ro'yxati turadi. `position.tomorrowTopicId` bilan
 *   ishlanganda tig'izlangan kunning ikkinchi mavzusi yo'qolardi va
 *   ertaga keyingi ISO haftaga o'tsa `null` qaytardi.
 */
export function anchorDayFor(now: Date): Date {
  return dayToDate(dayNumber(schoolDay(now)) + 1);
}

/** Ikki sana BIR XIL kunmi (UTC yarim kecha shartnomasi bo'yicha). */
function sameDay(a: Date, b: Date): boolean {
  return dayNumber(a) === dayNumber(b);
}

/**
 * Darvozalar — birinchi yiqilganda foydalanuvchi TASHLAB KETILADI.
 *
 * Tartib va "nega aynan shunday" lari:
 *
 * 1. `remindersEnabled = false` -> hech narsa. IKKALA tur uchun ham.
 * 2. Yakshanba xulosasi ALOHIDA: `weeklyDigestEnabled` 1-darvoza USTIGA
 *    qo'shiladi, uning ALTERNATIVASI emas (`else` bo'lib yozilsa
 *    eslatmani butunlay o'chirgan odam xulosani olib qolardi).
 * 3. Bir kunda bitta xabar — solishtirish TOSHKENT kuni bo'yicha. Sodda
 *    UTC solishtirish 23:00 UTC (= ertasi kun 04:00 Toshkent) holatini
 *    xato hal qiladi.
 * 4. Ta'til haftasi -> dars yo'q.
 *
 *    NEGA `lessons.length === 0`, `!inTeachingPeriod` EMAS: chorak
 *    chorshanbadan boshlansa `teachingWeek(quarters, dushanba)` — `null`,
 *    lekin chorshanba–shanba darslari CHINDAN bor. `inTeachingPeriod` ni
 *    darvoza qilsak o'qituvchi chorakning birinchi haftasiga xulosa
 *    olmasdi. `placeTopics` ta'tilda ham, bayramda ham slot qo'ymaydi,
 *    ya'ni nol dars strukturadan o'zi kelib chiqadi. Shu bitta qoida
 *    "jadvalsiz" va "sinfsiz" o'qituvchini ham yopadi.
 * 5. Kunlik: faqat ERTANGI va TAYYOR BO'LMAGAN darslar; bo'sh bo'lsa
 *    xabar yo'q.
 * 6. Xulosa: haftaning HAMMASI — uning vazifasi "nima tayyor / nima yo'q".
 */
export function planReminders(input: ReminderPlanInput): ReminderMessage[] {
  const { kind, now } = input;
  const today = schoolDay(now);
  const tomorrow = anchorDayFor(now);
  const messages: ReminderMessage[] = [];

  for (const user of input.users) {
    if (!user.remindersEnabled) continue;
    if (kind === "weeklyDigest" && !user.weeklyDigestEnabled) continue;
    if (user.lastReminderAt && sameDay(schoolDay(user.lastReminderAt), today)) continue;
    if (user.week.lessons.length === 0) continue;

    const lessons =
      kind === "daily"
        ? user.week.lessons.filter(
            (lesson) => lesson.date !== null && sameDay(lesson.date, tomorrow) && lesson.ready !== "full",
          )
        : user.week.lessons;

    if (lessons.length === 0) continue;

    messages.push({
      userId: user.userId,
      chatId: user.chatId,
      locale: user.locale,
      kind,
      lessons,
      weekStart: user.week.weekStart,
      weekEnd: user.week.weekEnd,
      lessonCount: user.week.lessonCount,
      readyCount: user.week.readyCount,
    });
  }

  return messages;
}
