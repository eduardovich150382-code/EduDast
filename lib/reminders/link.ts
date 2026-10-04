import { localePath } from "@/lib/i18n/locale-path";
import type { AppLocale } from "@/lib/i18n/routing";
import type { ReminderLesson } from "@/lib/reminders/plan";

/**
 * Darsga olib boradigan chuqur havola — SOF modul.
 *
 * Shartnoma bosh sahifadagi `prepareHref` bilan AYNAN bir xil:
 * `/ish/yarat?fan=&sinf=&chorak=&mavzu=`. Ikki joyda alohida qurilsa
 * ular vaqt o'tib ajralib ketardi va Telegram'dagi havola sehrgarni
 * bo'sh holatda ochib qo'yardi.
 */

/** Havolaga tushadigan minimal ma'lumot — to'liq `ReminderLesson` shart emas. */
export type LinkableLesson = Pick<
  ReminderLesson,
  "subjectSlug" | "grade" | "quarter" | "topicId"
>;

/**
 * Query tartibi QOTIRILGAN (fan, sinf, chorak, mavzu) — test literal
 * satrni tekshiradi, ya'ni tartib tasodifan o'zgarib ketmaydi.
 */
export function lessonQuery(lesson: LinkableLesson): URLSearchParams {
  const query = new URLSearchParams();
  query.set("fan", lesson.subjectSlug);
  query.set("sinf", String(lesson.grade));
  if (lesson.quarter !== null) query.set("chorak", String(lesson.quarter));
  query.set("mavzu", lesson.topicId);
  return query;
}

/**
 * Til prefiksi bilan NISBIY yo'l.
 *
 * Prefiks SHART: `routing.localePrefix === "always"`, ya'ni prefikssiz
 * havola Telegram'dan bosilganda ortiqcha redirect orqali o'tardi.
 */
export function lessonPath(locale: AppLocale, lesson: LinkableLesson): string {
  return `${localePath(locale, "/ish/yarat")}?${lessonQuery(lesson)}`;
}

/**
 * Absolyut havola, yoki baza manzili sozlanmagan bo'lsa `null`.
 *
 * `null` — xato EMAS: renderer havola qatorini tashlab yuboradi va xabar
 * havolasiz ketadi (`lib/app-url.ts` degradatsiya intizomi).
 */
export function lessonUrl(
  baseUrl: string | null,
  locale: AppLocale,
  lesson: LinkableLesson,
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}${lessonPath(locale, lesson)}`;
}
