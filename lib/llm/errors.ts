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
