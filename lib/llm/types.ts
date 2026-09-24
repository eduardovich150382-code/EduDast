import type { z } from "zod";

/**
 * LLM qatlamining umumiy turlari.
 *
 * MUHIM: bu fayldagi hech bir tur provayder SDK'sining turiga bog'liq
 * BO'LMASLIGI kerak. `ProviderRequest`/`ProviderResult` — sof ma'lumot.
 * Agar bu yerga `Anthropic.MessageParam` kabi tur kirib kelsa, abstraksiya
 * oqib ketgan bo'ladi va ikkinchi provayderni qo'shish qiyinlashadi.
 * Buni `tests/llm-guard.test.ts` tekshiradi.
 */

/** Model darajasi. Aniq model `lib/llm/router.ts` da tanlanadi. */
export type Tier = "cheap" | "mid" | "hard";

export type ProviderId = "anthropic" | "gemini" | "fake";

/** Bitta chaqiruvning token sarfi. */
export type Usage = {
  tokensIn: number;
  tokensOut: number;
  /** Keshdan o'qilgan tokenlar (arzon). Provayder qo'llab-quvvatlamasa 0. */
  cacheRead: number;
  /** Keshga yozilgan tokenlar (odatdagidan qimmat). Qo'llab-quvvatlanmasa 0. */
  cacheWrite: number;
};

export const ZERO_USAGE: Usage = {
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * System promptning bir bo'lagi.
 *
 * TARTIB MUHIM: keshlanadigan qismlar boshida, o'zgaruvchanlari oxirida
 * turishi shart. Kesh prefiks bo'yicha ishlaydi — birinchi qismda bitta
 * belgi o'zgarsa, undan keyingi hamma narsa keshdan tushadi.
 */
export type SystemPart = {
  text: string;
  /** `true` bo'lsa bu qismgacha (shu qism ham) kesh chegarasi qo'yiladi. */
  cacheable?: boolean;
};

export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Effort = "low" | "medium" | "high";

export type LlmRequest<T> = {
  /**
   * Chaqiruvning maqsadi — `LlmCall.purpose` ga yoziladi.
   * Shakl: "<feature>:<bosqich>", masalan "lesson-plan:stage-2".
   * Marja tahlili shu maydon bo'yicha guruhlanadi, shuning uchun erkin
   * matn emas, barqaror kalit yozing.
   */
  purpose: string;
  tier: Tier;
  /** `null` — tizim chaqiruvi (backfill, cron). Foydalanuvchi yo'q. */
  userId: string | null;
  /** A/B taqsimoti shu qiymatning hashidan olinadi. */
  documentId?: string;
  system: SystemPart[];
  messages: LlmMessage[];
  /**
   * Chiqish sxemasi MAJBURIY. Erkin matn qaytaradigan yo'l ataylab yo'q:
   * hujjat `contentJson` blok-struktura sifatida saqlanadi (CLAUDE.md,
   * "Qilma"), demak parse qilinmaydigan javob baribir yaroqsiz.
   */
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  effort?: Effort;
};

export type LlmResult<T> = {
  /** Zod bilan tekshirilgan natija. */
  data: T;
  /** Haqiqatda ishlatilgan model (zaxiraga tushgan bo'lishi mumkin). */
  model: string;
  provider: ProviderId;
  usage: Usage;
  /** 6 xonali o'nlik SATR — to'g'ridan `Decimal(10,6)` ga tushadi. */
  costUsd: string;
  /** Yozilgan `LlmCall` qatori. Jurnal yiqilsa `null`. */
  llmCallId: string | null;
};

/** Provayderga uzatiladigan normallashtirilgan so'rov. SDK turlari yo'q. */
export type ProviderRequest = {
  model: string;
  system: SystemPart[];
  messages: LlmMessage[];
  /** Zod'dan olingan JSON Schema. */
  jsonSchema: unknown;
  maxOutputTokens: number;
  effort: Effort;
};

export type ProviderResult = {
  /** Model qaytargan xom JSON matni. Zod parse chaqiruvchida bo'ladi. */
  rawJson: string;
  usage: Usage;
};

export type LlmProvider = {
  id: ProviderId;
  generate(req: ProviderRequest): Promise<ProviderResult>;
};

export type EmbeddingProvider = {
  id: string;
  model: string;
  dim: number;
  embed(
    texts: string[],
    kind: "document" | "query",
  ): Promise<{ vectors: number[][]; usage: Usage }>;
};
