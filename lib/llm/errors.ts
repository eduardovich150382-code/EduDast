import type { Usage } from "./types";

/** LLM qatlamining xato turlari. */
export type LlmErrorKind =
  /** Byudjet shifti — chaqiruv umuman qilinmadi. */
  | "budget"
  /** Generatsiya o'chirilgan (`GENERATION_ENABLED=false`). */
  | "disabled"
  /** So'rov chegarasi — qayta urinish mumkin. */
  | "rate_limit"
  /** Provayder vaqtincha ishlamayapti — qayta urinish mumkin. */
  | "overloaded"
  /** Model kontent sababli rad etdi — qayta urinish MA'NOSIZ. */
  | "refusal"
  /** Javob sxemaga mos kelmadi. */
  | "invalid_output"
  /** Provayder sozlanmagan (kalit yo'q). */
  | "not_configured"
  /** Boshqa hammasi. */
  | "unknown";

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly retryable: boolean;
  readonly provider?: string;
  readonly model?: string;

  constructor(
    kind: LlmErrorKind,
    message: string,
    opts: { provider?: string; model?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "LlmError";
    this.kind = kind;
    this.retryable = kind === "rate_limit" || kind === "overloaded";
    this.provider = opts.provider;
    this.model = opts.model;
  }
}

export function isLlmError(e: unknown): e is LlmError {
  return e instanceof LlmError;
}

/** Hech qanday token sarflanmagani ma'lum bo'lmagan hol uchun. */
export const ZERO_USAGE: Usage = {
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Xatoga ilova qilingan `usage` ni o'qiydi.
 *
 * Provayderlar buni kafolatlamaydi — SDK xatolarida odatda token soni
 * bo'lmaydi. Shuning uchun `null` "sarflanmadi" degani EMAS, "noma'lum"
 * degani.
 */
export function usageFromError(e: unknown): Usage | null {
  if (typeof e !== "object" || e === null) return null;
  const u = (e as { usage?: unknown }).usage;
  if (typeof u !== "object" || u === null) return null;
  const rec = u as Record<string, unknown>;
  if (typeof rec.tokensIn !== "number") return null;
  return {
    tokensIn: rec.tokensIn,
    tokensOut: typeof rec.tokensOut === "number" ? rec.tokensOut : 0,
    cacheRead: typeof rec.cacheRead === "number" ? rec.cacheRead : 0,
    cacheWrite: typeof rec.cacheWrite === "number" ? rec.cacheWrite : 0,
  };
}

/**
 * Provayderning O'Z xabarini qisqartirib qaytaradi.
 *
 * Statusning o'zi ("API xatosi 404") nima qilish kerakligini aytmaydi:
 * 404 model topilmadimi, metod qo'llab-quvvatlanmaydimi yoki API versiyasi
 * boshqami — buni faqat provayder matni aytadi.
 */
export function errorDetail(e: unknown, max = 300): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : typeof e === "object" && e !== null
          ? String((e as { message?: unknown }).message ?? "")
          : "";
  const flat = raw.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
