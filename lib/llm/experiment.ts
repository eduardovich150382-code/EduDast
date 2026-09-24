import { createHash } from "node:crypto";
import type { EnvLike } from "@/lib/budget/limits";
import type { ProviderId } from "./types";

/**
 * Claude / Gemini A/B taqsimoti.
 *
 * NEGA DETERMINISTIK: bitta hujjatning barcha bosqichlari BITTA provayderda
 * ketishi shart. Aralash hujjat (skeleti Claude'da, mazmuni Gemini'da)
 * sifat o'lchovini ma'nosiz qiladi — qaysi biri aybdor ekanini bilib
 * bo'lmaydi.
 *
 * Taqsimot kaliti — `documentId`. `purpose` kalitga QO'SHILMAYDI, aks holda
 * har bosqich boshqa provayderga tushib ketardi.
 */

export const AB_PROVIDERS: readonly ProviderId[] = ["anthropic", "gemini"];

export function isAbEnabled(env: EnvLike = process.env): boolean {
  return env.LLM_AB_ENABLED === "true";
}

/**
 * Taqsimot kalitiga qarab provayderni tanlaydi.
 *
 * `key` yo'q bo'lsa (hujjatsiz tizim chaqiruvi) — asosiy provayder.
 * Bu ataylab: backfill va cron chaqiruvlari sifat tajribasiga kirmaydi.
 */
export function pickProvider(
  key: string | undefined,
  opts: { enabled: boolean; primary: ProviderId; available: readonly ProviderId[] },
): ProviderId {
  const candidates = AB_PROVIDERS.filter((p) => opts.available.includes(p));

  if (candidates.length === 0) {
    // Hech biri sozlanmagan — chaqiruvchi `not_configured` xatosini ko'radi.
    return opts.primary;
  }
  if (!opts.enabled || key === undefined || candidates.length === 1) {
    return candidates.includes(opts.primary) ? opts.primary : candidates[0]!;
  }

  const digest = createHash("sha256").update(key).digest();
  return candidates[digest[0]! % candidates.length]!;
}
