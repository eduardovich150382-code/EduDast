import { createHash } from "node:crypto";
import type { EnvLike } from "@/lib/budget/limits";
import { LlmError } from "./errors";
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

/** `LLM_PRIMARY_PROVIDER` sozlanmagan bo'lsa. */
const DEFAULT_PRIMARY: ProviderId = "anthropic";

/** Boot log'i bir marta yozilishi uchun — jarayon boshiga bitta qator. */
let loggedPrimary: ProviderId | null = null;

/**
 * Asosiy provayder — A/B o'chiq bo'lganda HAMMA hujjat shunga tushadi.
 *
 * NEGA KONFIGURATSIYADA: `ANTHROPIC_API_KEY` hali yo'q. Kalit BO'SH bo'lsa
 * `availableProviders()` anthropic'ni baribir chiqarib tashlaydi, lekin kalit
 * NOTO'G'RI (muddati tugagan, xato ko'chirilgan) bo'lsa provayder "mavjud"
 * hisoblanadi va hujjatlarning yarmi `not_configured` bilan yiqiladi. Shu
 * knob o'sha holatni ham yopadi: `LLM_PRIMARY_PROVIDER=gemini` bo'lsa
 * taqsimot 100 % Gemini bo'ladi, Claude esa zanjirda ZAXIRA bo'lib qoladi —
 * A/B kodi o'chirilmaydi, kalit paydo bo'lgach bitta qator bilan qaytadi.
 *
 * NEGA NOTO'G'RI QIYMAT XATO BERADI: jimgina default'ga tushish eng yomon
 * holat — `LLM_PRIMARY_PROVIDER=Gemini` (bosh harf bilan) yozgan odam 100 %
 * Gemini kutib turib, amalda 50/50 olardi va buni faqat hisobdan bilardi.
 */
export function primaryProvider(env: EnvLike = process.env): ProviderId {
  const raw = env.LLM_PRIMARY_PROVIDER;
  let picked: ProviderId;

  if (raw === undefined || raw === "") {
    picked = DEFAULT_PRIMARY;
  } else if (raw === "anthropic" || raw === "gemini") {
    picked = raw;
  } else {
    throw new LlmError(
      "not_configured",
      `LLM_PRIMARY_PROVIDER noto'g'ri: "${raw}". Ruxsat etilgani: anthropic, gemini`,
    );
  }

  if (loggedPrimary !== picked) {
    loggedPrimary = picked;
    console.info(
      `[llm] asosiy provayder: ${picked}${raw === undefined || raw === "" ? " (default)" : ""}`,
    );
  }
  return picked;
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
