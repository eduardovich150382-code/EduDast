import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Telegram Login Widget payload'ini tekshirish.
 *
 * Telegram spetsifikatsiyasi (core.telegram.org/widgets/login#checking-
 * authorization): `hash` dan tashqari BARCHA olingan maydonlar kalit bo'yicha
 * alifbo tartibida `key=value` shaklida `\n` bilan birlashtiriladi
 * (data-check-string), so'ng:
 *
 *     secret_key = SHA256(bot_token)          // xom baytlar, hex emas
 *     hash       = HMAC_SHA256(dcs, secret_key)
 *
 * XAVFSIZLIK SHARTLARI (CLAUDE.md va docs/sessions/02-auth.md):
 * - `botToken` — PARAMETR. Bu modul `process.env` ni o'qimaydi, tokenni
 *   qaytish qiymatiga ham, xato matniga ham qo'ymaydi. Xato turlari yopiq
 *   literal union — interpolatsiya yo'q, `throw` yo'q. Shu sabab "token
 *   hech qayerda log qilinmasin" talabini test bilan isbotlash mumkin.
 * - Hash taqqoslash constant-time (`timingSafeEqual`).
 * - `auth_date` 5 daqiqadan eski bo'lsa rad etiladi (replay hujumiga qarshi).
 * - Foydalanuvchi rasmi (`photo_url`) data-check-string uchun qabul qilinadi,
 *   lekin QAYTARILMAYDI va saqlanmaydi (R2 hali sozlanmagan).
 */

/** `auth_date` shundan eski bo'lsa payload rad etiladi. */
export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 300;

/**
 * Kelajakka yo'naltirilgan `auth_date` uchun ruxsat etilgan chegara.
 * Soat siljishi normal, lekin katta farq — soxta sana belgisi.
 */
export const TELEGRAM_AUTH_MAX_SKEW_SECONDS = 60;

export type TelegramVerifyFailure =
  | "missing_hash"
  | "invalid_payload"
  | "bad_hash"
  | "expired";

export type TelegramUser = {
  telegramId: bigint;
  fullName: string;
  username: string | null;
  authDate: number;
};

export type TelegramVerifyResult =
  | { ok: true; data: TelegramUser }
  | { ok: false; reason: TelegramVerifyFailure };

/** SHA-256 HMAC hex ko'rinishi — aynan 64 ta kichik hex belgi. */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * `hash` bu yerda ATAYLAB yo'q — u alohida, o'z xato sababi bilan
 * tekshiriladi. Noma'lum maydonlar (masalan `photo_url`) zod tomonidan
 * olib tashlanadi, lekin data-check-string xom `params` dan quriladi,
 * shuning uchun ular imzoga baribir kiradi.
 */
const payloadSchema = z.object({
  id: z.string().regex(/^\d{1,19}$/),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  auth_date: z.string().regex(/^\d{1,15}$/),
});

/**
 * Telegram tekshiradigan satrni quradi: `hash` dan boshqa hamma maydon,
 * kalit bo'yicha saralangan. Maydonlar ro'yxati ATAYLAB allowlist
 * qilinmaydi — Telegram kelajakda yangi maydon qo'shsa, u ham imzoga
 * kirishi kerak, aks holda barcha hash'lar yiqiladi.
 */
export function buildDataCheckString(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/**
 * Tartib muhim: shakl → hash → sana. Buzilgan payload sana tekshiruviga
 * yetib bormaydi, ya'ni hujumchi `auth_date` orqali hech qanday ma'lumot
 * ola olmaydi.
 */
export function verifyTelegramAuth(
  params: Record<string, string>,
  opts: { botToken: string; nowSeconds?: number; maxAgeSeconds?: number },
): TelegramVerifyResult {
  const providedHash = params.hash;
  if (!providedHash) return { ok: false, reason: "missing_hash" };

  const parsed = payloadSchema.safeParse(params);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  // Formatni HMAC'dan OLDIN tekshiramiz: `timingSafeEqual` uzunliklar mos
  // kelmasa `throw` qiladi, biz esa hech qachon throw qilmasligimiz kerak.
  if (!HASH_PATTERN.test(providedHash)) return { ok: false, reason: "bad_hash" };

  const secretKey = createHash("sha256").update(opts.botToken).digest();
  const expected = createHmac("sha256", secretKey)
    .update(buildDataCheckString(params))
    .digest();
  const provided = Buffer.from(providedHash, "hex");

  // Uzunlik qorovuli — yuqoridagi regex tufayli hozir har doim teng, lekin
  // regex kelajakda yumshatilsa ham bu yer throw qilmasligi kerak.
  if (expected.length !== provided.length) return { ok: false, reason: "bad_hash" };
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: "bad_hash" };

  const authDate = Number(parsed.data.auth_date);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSeconds ?? TELEGRAM_AUTH_MAX_AGE_SECONDS;

  if (now - authDate > maxAge) return { ok: false, reason: "expired" };
  if (authDate - now > TELEGRAM_AUTH_MAX_SKEW_SECONDS) return { ok: false, reason: "expired" };

  const fullName = [parsed.data.first_name, parsed.data.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");

  return {
    ok: true,
    data: {
      telegramId: BigInt(parsed.data.id),
      fullName,
      username: parsed.data.username?.trim() || null,
      authDate,
    },
  };
}
