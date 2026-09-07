import { SignJWT, jwtVerify } from "jose";

/**
 * Sessiya JWT'i — imzolash va tekshirish. SOF modul: `next/headers` ham,
 * Prisma ham import qilinmaydi. Shu sabab uni ham `proxy.ts` dan, ham
 * vitest'dan bemalol chaqirish mumkin.
 *
 * XAVFSIZLIK SHARTLARI (docs/sessions/02-auth.md):
 * - `alg` QAT'IY pinlangan: faqat HS256. Bu `alg: "none"` hujumini ham,
 *   alg-confusion (masalan RS256 bilan imzolangan token) hujumini ham yopadi.
 * - `exp` MAJBURIY: `requiredClaims` tufayli muddatsiz token rad etiladi.
 * - Kalit `SESSION_SECRET` dan, kamida 32 bayt. Tekshiruv LAZY — modul
 *   yuklanganda emas, chaqirilganda; aks holda sirlarsiz `next build`
 *   yiqilardi. Ishga tushishdagi qat'iy tekshiruv instrumentation.ts da.
 * - Xato matnlarida sirning O'ZI hech qachon bo'lmaydi.
 */

export const SESSION_COOKIE = "edudast_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 kun
export const SESSION_SECRET_MIN_BYTES = 32;

const SESSION_ALG = "HS256";

/**
 * Payload ataylab minimal:
 * - `sub` — User.id (cuid).
 * - `onb` — onboarding tugaganmi. Bitta bit, faqat oldinga o'zgaradi.
 *   Shuning uchun proxy har navigatsiyada bazaga bormaydi.
 * - `sv`  — User.sessionVersion. Bazadagidan farq qilsa sessiya bekor
 *   (stateless JWT'ni bekor qilishning yagona yo'li).
 *
 * `telegramId` ATAYLAB yo'q — u BigInt, JSON'ga tushmaydi va bu yerda
 * kerak ham emas.
 */
export type SessionPayload = {
  sub: string;
  onb: boolean;
  sv: number;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const key = secret ? new TextEncoder().encode(secret) : new Uint8Array();

  if (key.length < SESSION_SECRET_MIN_BYTES) {
    // Diqqat: xabarda faqat uzunlik bor, sirning o'zi YO'Q.
    throw new Error(
      `SESSION_SECRET yo'q yoki juda qisqa (${key.length} bayt, kamida ` +
        `${SESSION_SECRET_MIN_BYTES} kerak).`,
    );
  }

  return key;
}

export async function encodeSession(
  payload: SessionPayload,
  opts: { maxAgeSeconds?: number } = {},
): Promise<string> {
  const maxAge = opts.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ onb: payload.onb, sv: payload.sv })
    .setProtectedHeader({ alg: SESSION_ALG })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + maxAge)
    .sign(getSecretKey());
}

/**
 * Har qanday nosozlikda `null` — HECH QACHON throw qilmaydi. Sababi:
 * eskirgan yoki buzuq cookie tufayli proxy 500 bermasligi kerak, shunchaki
 * "kirmagan" deb hisoblanadi.
 *
 * Yagona istisno — `SESSION_SECRET` sozlanmagani: bu foydalanuvchi xatosi
 * emas, sozlash xatosi, va u ham shu yerda yutiladi (instrumentation.ts
 * ishga tushishda baland ovozda ogohlantiradi).
 */
export async function decodeSession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [SESSION_ALG],
      requiredClaims: ["exp", "sub"],
    });

    const { sub, onb, sv } = payload;
    if (typeof sub !== "string" || sub.length === 0) return null;
    if (typeof onb !== "boolean") return null;
    if (typeof sv !== "number" || !Number.isInteger(sv)) return null;

    return { sub, onb, sv };
  } catch {
    return null;
  }
}
