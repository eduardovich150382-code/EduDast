import { z } from "zod";

/**
 * "YYYY-MM-DD" -> **UTC yarim kecha** `Date` — kalendar sanalarining yagona
 * Zod shartnomasi.
 *
 * SANA SHARTNOMASI: `lib/calendar/placement.ts` sanalarni `getUTC*` bilan
 * o'qiydi, shuning uchun mahalliy yarim kecha (Toshkentda UTC'ning oldingi kuni
 * 19:00) yozilsa butun reja bir kunga siljirdi. Sxemada `@db.Date` yo'q, ya'ni
 * bu shartnomani faqat kod saqlaydi.
 *
 * ALOHIDA MODULDA, chunki ikki action'ga kerak: `server/calendar-actions.ts`
 * (chorak va ta'til sanalari) va `server/progress-actions.ts`
 * (`TopicProgress.taughtOn`). Ikkinchi nusxa yozilsa biri o'zgarganda
 * ikkinchisi JIMGINA eskirardi.
 *
 * TESKARI TEKSHIRUV SHART: mavjud bo'lmagan sanani JS `Invalid Date` QILMAYDI
 * — `2027-02-31` JIMGINA `2027-03-03` ga aylanadi. Faqat oy 13 bo'lganda
 * `NaN` chiqadi. Shuning uchun aylantirilgan sana teskari yozilganda aynan
 * o'sha satr berishi tekshiriladi, aks holda terish xatosi boshqa sanaga
 * aylanib ketardi.
 */
export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "sana YYYY-MM-DD shaklida bo'lishi kerak")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "sana haqiqiy emas")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
