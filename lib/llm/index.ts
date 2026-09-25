/**
 * LLM qatlamining yagona tashqi eshigi.
 *
 * Kod qolgan qismi FAQAT shu fayldan import qiladi. Provayder adapterlari
 * (`./providers/*`) ataylab eksport qilinmaydi — `tests/llm-guard.test.ts`
 * ularni tashqarida import qilishni taqiqlaydi.
 *
 * Nega: har chaqiruvda xarajat yozilishi (CLAUDE.md 3-qoida) va byudjet
 * tekshirilishi (5-qoida) shart. Adapter to'g'ridan chaqirilsa, ikkalasi
 * ham chetlab o'tiladi.
 */

export { runLlm } from "./call";
export { embedTexts, embedQuery } from "./embeddings";
export { LlmError, isLlmError, type LlmErrorKind } from "./errors";
export { MODELS, EMBEDDING_MODEL, type ModelId } from "./models";
export { costFor, microsToUsd } from "./pricing";
export type {
  Effort,
  LlmMessage,
  LlmRequest,
  LlmResult,
  ProviderId,
  SystemPart,
  Tier,
  Usage,
} from "./types";
