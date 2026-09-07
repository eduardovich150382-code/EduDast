import type { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { GET as telegramCallback } from "./[locale]/route";

/**
 * `/api/auth/telegram` (locale'siz) — standart tilga o'ralgan qisqa yo'l.
 * `auth_url` odatda `/api/auth/telegram/{locale}` bo'ladi, lekin bu
 * so'rovga ham javob beradi.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return telegramCallback(request, {
    params: Promise.resolve({ locale: routing.defaultLocale }),
  });
}
