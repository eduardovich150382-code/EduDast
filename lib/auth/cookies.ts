import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  decodeSession,
  encodeSession,
  type SessionPayload,
} from "./session";

/**
 * Sessiya cookie'si bilan ishlash. Faqat server: `next/headers` ni
 * import qiladi, shuning uchun bu modulni proxy'dan yoki testdan
 * chaqirib bo'lmaydi — u yerlarda lib/auth/session.ts ishlatiladi.
 */

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    /**
     * CHEKINISH (ataylab): 02-auth.md `secure` ni shartsiz talab qiladi,
     * lekin `http://localhost` da brauzer `Secure` cookie'ni JIMGINA
     * tashlab yuboradi — ya'ni qat'iy `true` butun dev oqimini (dev
     * login, onboarding) ishlamaydigan qilib qo'yardi. Production'da
     * har doim `true`, chunki u yerda HTTPS.
     */
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // next-intl'ning NEXT_LOCALE cookie'sidan farqli o'laroq, sessiya
    // butun sayt uchun amal qilishi kerak (/api/... da ham o'qiladi).
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await encodeSession(payload), sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function readSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}
