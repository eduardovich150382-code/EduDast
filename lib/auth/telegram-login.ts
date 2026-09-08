import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Telegram bot deep-link login uchun SOF mantiq: kod/verifier yasash,
 * `/start` buyrug'ini o'qish, deep-link qurish.
 *
 * Bu modul `process.env` ni ham, Prisma'ni ham, `next/*` ni ham import
 * qilmaydi — shuning uchun butun xavfsizlik mantig'ini vitest bilan
 * to'g'ridan-to'g'ri qoplash mumkin (tests/telegram-login.test.ts).
 *
 * NEGA IKKI SIR:
 * - `code` deep-link ichida Telegram orqali o'tadi. Uni foydalanuvchi
 *   ko'radi, forward qilishi ham mumkin — ya'ni u YOLG'IZ o'zi sessiya
 *   berishga yetarli bo'lmasligi kerak.
 * - `verifier` faqat login boshlangan brauzerdagi httpOnly cookie'da
 *   turadi, bazada esa uning SHA-256'si. Holat so'rovi ikkalasini ham
 *   talab qiladi.
 */

/** Telegram `start` parametri: eng ko'pi 64 belgi, faqat [A-Za-z0-9_-]. */
export const LOGIN_CODE_BYTES = 24; // → 32 belgi base64url
export const LOGIN_VERIFIER_BYTES = 32; // → 43 belgi base64url

/** Token shu muddatdan keyin yaroqsiz. Telefonga o'tib-qaytish uchun yetarli. */
export const LOGIN_TOKEN_MAX_AGE_SECONDS = 10 * 60;

/** Brauzerdagi qisqa umrli cookie — sessiya cookie'si bilan aralashmasin. */
export const LOGIN_VERIFIER_COOKIE = "edudast_login";

/**
 * Cookie faqat shu prefiks ostiga yuboriladi: u boshqa hech qaysi
 * so'rovga (RSC prefetch, rasm, sahifa navigatsiyasi) qo'shilmasin.
 */
export const LOGIN_VERIFIER_COOKIE_PATH = "/api/auth/telegram";

const CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function createLoginCode(): string {
  return randomBytes(LOGIN_CODE_BYTES).toString("base64url");
}

export function createLoginVerifier(): string {
  return randomBytes(LOGIN_VERIFIER_BYTES).toString("base64url");
}

export function hashVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("hex");
}

export function isValidLoginCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/**
 * Constant-time taqqoslash. Kirish qiymatlari avval hash'lanadi, ya'ni
 * uzunliklar har doim teng — `timingSafeEqual` throw qilmaydi.
 */
export function verifierMatches(verifier: string, storedHash: string): boolean {
  if (!VERIFIER_PATTERN.test(verifier)) return false;
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false;

  const a = Buffer.from(hashVerifier(verifier), "hex");
  const b = Buffer.from(storedHash, "hex");
  return timingSafeEqual(a, b);
}

/**
 * Bot xabaridan `/start` buyrug'ini o'qiydi.
 *
 * Telegram buyruqni guruhda `/start@BotNomi` shaklida yuboradi, deep-link
 * esa `/start <payload>` bo'lib keladi. Payload noto'g'ri formatda bo'lsa
 * `code` — `null`, ya'ni oddiy salomlashuv xabari yuboriladi.
 */
export function parseStartCommand(
  text: string | undefined,
): { code: string | null } | null {
  if (!text) return null;

  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  if (!rawCommand) return null;

  const command = rawCommand.split("@")[0]?.toLowerCase();
  if (command !== "/start") return null;

  const payload = rest[0];
  return { code: payload && isValidLoginCode(payload) ? payload : null };
}

/** `https://t.me/EduDastBot?start=<code>` */
export function buildDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${code}`;
}

export type LoginTokenState = "kutilmoqda" | "tayyor" | "yaroqsiz";

/**
 * Token holatini aniqlaydi. Muddat va "bir martalik"lik shu yerda, ya'ni
 * route handler'da emas — jadval ko'rinishida test qilinadi.
 */
export function loginTokenState(
  token: {
    userId: string | null;
    approvedAt: Date | null;
    consumedAt: Date | null;
    expiresAt: Date;
  } | null,
  now: Date = new Date(),
): LoginTokenState {
  if (!token) return "yaroqsiz";
  if (token.consumedAt) return "yaroqsiz";
  if (token.expiresAt.getTime() <= now.getTime()) return "yaroqsiz";
  if (token.approvedAt && token.userId) return "tayyor";
  return "kutilmoqda";
}
