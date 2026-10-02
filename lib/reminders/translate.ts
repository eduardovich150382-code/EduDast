import { createTranslator } from "next-intl";
import type { AppLocale } from "@/lib/i18n/routing";
import type { ReminderTranslate } from "@/lib/reminders/render";

/**
 * `locale` -> tarjimon. Ingichka adapter, mantiq yo'q.
 *
 * NEGA `getTranslations` EMAS: u next-intl'ning SO'ROV scope'ini talab
 * qiladi. Eslatma yo'li esa uch xil kontekstda ishlaydi — cron route,
 * bot webhook'i va `scripts/send-test-reminder.ts` (umuman Next'dan
 * tashqarida). `createTranslator` scope'siz ishlaydi, ya'ni uchalasida
 * ham bir xil.
 *
 * Dinamik import `lib/i18n/request.ts` dagi bilan AYNAN bir xil —
 * xabarlar bitta manbadan o'qiladi.
 *
 * NOMFAZA BERILMAYDI: renderer kalitlarni to'liq yo'l bilan o'qiydi
 * ("Reminders.daily.title", "Week.weekday.3"), shunda mavjud 7 kun nomi
 * va 5 material yorlig'i qayta ishlatiladi.
 */
export async function reminderTranslate(locale: AppLocale): Promise<ReminderTranslate> {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const translate = createTranslator({ locale, messages });
  return (key, values) => translate(key, values);
}

/**
 * Sana formati — eslatma matni uchun.
 *
 * `timeZone: "UTC"` MAJBURIY: sanalar UTC yarim kecha shartnomasida
 * (`placement.ts`), mahalliy mintaqada esa sana bir kunga siljib
 * ko'rinardi.
 */
export function reminderDateFormat(locale: AppLocale): (date: Date) => string {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (date) => format.format(date);
}
