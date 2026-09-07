import * as Sentry from "@sentry/nextjs";
import { SESSION_SECRET_MIN_BYTES } from "./lib/auth/session";

/**
 * Sessiya kaliti ishga tushishda tekshiriladi — birinchi kirish urinishida
 * emas. lib/env.ts ataylab yumshoq (build sirlarsiz ham o'tishi kerak),
 * shuning uchun qat'iy tekshiruv shu yerda.
 *
 * Xato matnida sirning O'ZI yo'q — faqat uzunlik sharti.
 */
function assertSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  const bytes = secret ? new TextEncoder().encode(secret).length : 0;
  if (bytes >= SESSION_SECRET_MIN_BYTES) return;

  const message =
    `SESSION_SECRET yo'q yoki juda qisqa (${bytes} bayt, kamida ` +
    `${SESSION_SECRET_MIN_BYTES} kerak). \`openssl rand -base64 32\` bilan yarating.`;

  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.error(`[auth] ${message}`);
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertSessionSecret();
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server komponent, middleware va route handler xatolarini ushlaydi.
// DSN yo'q bo'lsa Sentry.init chaqirilmagan, shuning uchun bu ham jim ishlaydi.
export const onRequestError = Sentry.captureRequestError;
