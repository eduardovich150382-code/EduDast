/**
 * Bot buyruqlarini o'qiydigan SOF parser
 * (docs/sessions/12-eslatmalar.md, 6-band).
 *
 * `parseStartCommand` (`lib/auth/telegram-login.ts`) bilan bir uslubda va
 * ATAYLAB alohida: `/start` ning payload mantig'i (login kodi, uning
 * formati) bu buyruqlarga umuman tegishli emas, bir funksiyaga
 * qo'shilsa ikkisi bir-birini chalkashtirardi.
 *
 * Nega sof modul: webhook'dagi `handleStart` IO bilan aralashgan
 * (Prisma + `getTranslations` + `sendMessage`), ya'ni test qilinmaydi.
 * Buyruq TANIB OLISH mantig'i esa aynan jadval ko'rinishida tekshirilishi
 * kerak — guruhda `@BotNomi` qo'shimchasi, katta harf, ortiqcha bo'sh
 * joy.
 */

/** Bot biladigan buyruqlar (`/start` dan tashqari). */
export type BotCommand = "bugun" | "hafta" | "eslatma";

const COMMANDS: readonly BotCommand[] = ["bugun", "hafta", "eslatma"];

/**
 * Matndan buyruqni o'qiydi. Buyruq emas (yoki noma'lum) bo'lsa `null`.
 *
 * Telegram guruhda buyruqni `/bugun@EduDastBot` shaklida yuboradi,
 * shuning uchun `@` dan keyingi qism tashlab yuboriladi — `/start` da ham
 * aynan shunday qilinadi.
 *
 * Buyruqdan keyingi argumentlar E'TIBORGA OLINMAYDI: bu buyruqlarning
 * hech biri argument olmaydi, lekin foydalanuvchi tasodifan yozsa
 * buyruq baribir ishlashi kerak.
 */
export function parseBotCommand(text: string | undefined): BotCommand | null {
  if (!text) return null;

  const [raw] = text.trim().split(/\s+/);
  if (!raw) return null;

  const command = raw.split("@")[0]?.toLowerCase();
  if (!command?.startsWith("/")) return null;

  const name = command.slice(1);
  return (COMMANDS as readonly string[]).includes(name) ? (name as BotCommand) : null;
}

/** Matn buyruqqa o'xshaydimi — noma'lum buyruqqa javob berish uchun. */
export function looksLikeCommand(text: string | undefined): boolean {
  return Boolean(text?.trim().startsWith("/"));
}
