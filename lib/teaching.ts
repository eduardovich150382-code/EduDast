/**
 * Sinf va dars jadvalining o'zgarmas chegaralari (09-sessiya).
 *
 * NEGA ALOHIDA MODUL: bu qiymatlar ham action'ga (Zod validatsiyasi), ham
 * sahifaga (tanlov ro'yxatlari) kerak. `"use server"` fayldan esa FAQAT async
 * funksiya eksport qilish mumkin — const eksport qilinsa modul butunlay
 * buziladi ("The module has no exports at all") va import qilgan sahifa
 * build'da yiqiladi. Shuning uchun chegaralar shu yerda, yagona manba sifatida.
 */

/**
 * Sinf harflari — YOPIQ ro'yxat.
 *
 * Erkin satr bo'lsa lotin "A" va kirill "А" ikki xil sinf bo'lib qolardi va
 * `@@unique` ularni ajrata olmasdi: o'qituvchi ro'yxatda ikkita "7-A" ko'rib,
 * nega ikkitasi borligini tushunmasdi.
 *
 * "" — harfsiz sinf (maktabda bitta 7-sinf bo'lsa).
 */
export const CLASS_LABELS = ["", "A", "B", "V", "G", "D"] as const;

/** 1 — minimal; 12 — haftada har kuni ikki soatdan ham ko'p, ya'ni xato. */
export const MIN_LESSONS_PER_WEEK = 1;
export const MAX_LESSONS_PER_WEEK = 12;

/** Dushanba–shanba. Yakshanba dars kuni emas. */
export const MIN_WEEKDAY = 1;
export const MAX_WEEKDAY = 6;

/** Maktab jadvalidagi dars raqami. */
export const MIN_LESSON_NO = 1;
export const MAX_LESSON_NO = 8;

/** Jadval to'ri: 6 kun x 8 dars. Bundan ortiq katak faqat xato bo'lishi mumkin. */
export const MAX_SLOTS = MAX_WEEKDAY * MAX_LESSON_NO;

/** `ScheduleSlot.weekday` qiymatlari, tartib bilan. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

/** `ScheduleSlot.lessonNo` qiymatlari, tartib bilan. */
export const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
