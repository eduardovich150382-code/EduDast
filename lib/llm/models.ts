import type { ProviderId, Tier } from "./types";

/**
 * Model reyestri va narxlar.
 *
 * IKKI XIL TASDIQ — chalkashtirmang:
 *   `idVerifiedOn` — model ID provayderning O'Z API'sida bor (`pnpm llm:models`).
 *   `verified`     — NARX rasmiy narx sahifasidan olingan.
 * Birinchisi ikkinchisini bermaydi: API ro'yxati narx haqida hech narsa
 * aytmaydi, shuning uchun ID tasdiqlangan model ham `verified: false` bo'lishi
 * mumkin.
 *
 * NARX QAYERDAN: Anthropic — rasmiy narx sahifasi, 2026-06-24 holatiga.
 * Gemini — 2026-09 holatiga, ikkilamchi manbalardan (rasmiy sahifa hali
 * ochilmadi), shuning uchun `verified: false`.
 *
 * BU JADVAL 3 OYDAN ESKI BO'LSA — marja hisobiga ishonishdan oldin jonli
 * narx sahifasini tekshiring. Model ID'lari to'g'riligini `pnpm llm:models`
 * bilan provayderning O'Z API'sidan tekshirish mumkin: noto'g'ri ID darhol
 * ko'rinadi.
 *
 * Narxlar million token uchun AQSH dollarida. Hisob `pricing.ts` da butun
 * mikrodollarda ketadi — float yaxlitlash xatosi `Decimal(10,6)` ustuniga
 * tushmasligi uchun.
 */

export type ModelEntry = {
  id: string;
  provider: ProviderId;
  tier: Tier;
  /** Million token uchun dollarda. */
  inputPerMTok: number;
  outputPerMTok: number;
  /** Keshga yozish koeffitsienti (kirish narxiga nisbatan). */
  cacheWriteMultiplier: number;
  /** Keshdan o'qish koeffitsienti (kirish narxiga nisbatan). */
  cacheReadMultiplier: number;
  maxOutputTokens: number;
  /** `adaptive` — Claude 4.6+; `budget` — eski Claude; `none` — Gemini. */
  thinkingStyle: "adaptive" | "budget" | "none";
  /** Kuniga bepul so'rovlar soni. `null` — bepul kvota yo'q. */
  freeTierRpd: number | null;
  /** NARX rasmiy manbadan tasdiqlanganmi. ID ni tasdiqlamaydi. */
  verified: boolean;
  /**
   * Model ID provayder API'sida borligi tasdiqlangan sana (`pnpm llm:models`).
   * Yo'q bo'lsa — hali tekshirilmagan (masalan kalit sozlanmagan).
   */
  idVerifiedOn?: string;
  /** Narx shu sanadan keyin o'zgarishi ma'lum bo'lsa. */
  priceChangesOn?: string;
  note?: string;
};

export const MODELS = {
  // --- Anthropic (narxlar rasmiy sahifadan, 2026-06-24) ---
  "claude-opus-5": {
    id: "claude-opus-5",
    provider: "anthropic",
    tier: "hard",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    maxOutputTokens: 64_000,
    thinkingStyle: "adaptive",
    freeTierRpd: null,
    verified: true,
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    provider: "anthropic",
    tier: "mid",
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    maxOutputTokens: 64_000,
    thinkingStyle: "adaptive",
    freeTierRpd: null,
    verified: true,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    tier: "cheap",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    maxOutputTokens: 32_000,
    thinkingStyle: "budget",
    freeTierRpd: null,
    verified: true,
  },

  // --- Gemini (ikkilamchi manbalardan, tasdiqlash kerak) ---
  "gemini-3.1-pro-preview": {
    id: "gemini-3.1-pro-preview",
    provider: "gemini",
    tier: "hard",
    inputPerMTok: 2.0,
    outputPerMTok: 12.0,
    // Gemini kontekst keshi alohida API — v1 da ishlatilmaydi, shuning
    // uchun koeffitsientlar 1 (kesh yutug'i yo'q deb hisoblanadi).
    cacheWriteMultiplier: 1,
    cacheReadMultiplier: 1,
    maxOutputTokens: 64_000,
    thinkingStyle: "none",
    freeTierRpd: null,
    verified: false,
    idVerifiedOn: "2026-09-25",
    note: "200K tokendan oshsa qayta narxlanadi ($4/$18) — uzun promptda hisob past chiqadi.",
  },
  "gemini-3.8-flash": {
    id: "gemini-3.8-flash",
    provider: "gemini",
    tier: "mid",
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    cacheWriteMultiplier: 1,
    cacheReadMultiplier: 1,
    maxOutputTokens: 32_000,
    thinkingStyle: "none",
    freeTierRpd: 200,
    verified: false,
    idVerifiedOn: "2026-09-25",
    priceChangesOn: "2027-01-01",
    note: "Aksiya narxi. 2027-01-01 dan $1.50/$7.50 ga oshadi.",
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    provider: "gemini",
    tier: "cheap",
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    cacheWriteMultiplier: 1,
    cacheReadMultiplier: 1,
    maxOutputTokens: 16_000,
    thinkingStyle: "none",
    freeTierRpd: 1000,
    verified: false,
    idVerifiedOn: "2026-09-25",
    // Reyestrda eng eski avlod: API ro'yxatida 3.1 va 3.5 flash-lite ham bor.
    // Almashtirishdan oldin narxi kerak — arzon uya qimmatlashib qolmasin.
    note: "Arzon uya 2.5 avlodida, mid esa 3.8 da — narx tasdiqlangach qayta ko'rilsin.",
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODELS;

export const EMBEDDING_MODEL = {
  id: "gemini-embedding-001",
  provider: "gemini" as const,
  /** Matryoshka kesish: 768/1536/3072 qo'llab-quvvatlanadi, narx bir xil. */
  dim: 768,
  inputPerMTok: 0.15,
  verified: false,
  idVerifiedOn: "2026-09-25",
};

/** Har provayder uchun daraja → model xaritasi. */
export const TIER_MODELS: Record<ProviderId, Record<Tier, ModelId | null>> = {
  anthropic: {
    hard: "claude-opus-5",
    mid: "claude-sonnet-5",
    cheap: "claude-haiku-4-5",
  },
  gemini: {
    hard: "gemini-3.1-pro-preview",
    mid: "gemini-3.8-flash",
    cheap: "gemini-2.5-flash-lite",
  },
  fake: { hard: null, mid: null, cheap: null },
};

/** Arzonlashtirish tartibi. `cheap` dan pastga tushib bo'lmaydi. */
export const TIER_ORDER: readonly Tier[] = ["cheap", "mid", "hard"] as const;

export function lowerTier(tier: Tier): Tier {
  const i = TIER_ORDER.indexOf(tier);
  return i <= 0 ? "cheap" : TIER_ORDER[i - 1]!;
}

export function getModel(id: string): ModelEntry | undefined {
  return (MODELS as Record<string, ModelEntry>)[id];
}
