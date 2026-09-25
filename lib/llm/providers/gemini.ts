import { GoogleGenAI } from "@google/genai";
import { errorDetail, LlmError } from "../errors";
import { EMBEDDING_MODEL } from "../models";
import type {
  EmbeddingProvider,
  LlmProvider,
  ProviderRequest,
  ProviderResult,
  Usage,
} from "../types";

/**
 * Gemini adapteri.
 *
 * `@google/genai` import qilinishi RUXSAT ETILGAN yagona joy (guard testi).
 *
 * Kontekst keshi Gemini'da alohida API (`caches`) — v1 da ishlatilmaydi,
 * shuning uchun `models.ts` da kesh koeffitsientlari 1 va bu yerda
 * `cacheRead`/`cacheWrite` har doim 0 qaytadi. Ya'ni narx hisobi Gemini
 * chaqiruvlarida kesh yutug'ini VA'DA QILMAYDI.
 */

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new LlmError("not_configured", "GOOGLE_API_KEY sozlanmagan", {
      provider: "gemini",
    });
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Faqat testlar uchun. */
export function resetGeminiClient(): void {
  client = null;
}

export const geminiProvider: LlmProvider = {
  id: "gemini",

  async generate(req: ProviderRequest): Promise<ProviderResult> {
    // Gemini'da system — alohida maydon, kesh chegarasi yo'q, shuning uchun
    // barcha qismlar birlashtiriladi.
    const systemInstruction = req.system.map((p) => p.text).join("\n\n");

    try {
      const res = await getClient().models.generateContent({
        model: req.model,
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction,
          maxOutputTokens: req.maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: req.jsonSchema,
        },
      });

      const text = res.text ?? "";
      const u = res.usageMetadata;

      return {
        rawJson: text,
        usage: {
          tokensIn: u?.promptTokenCount ?? 0,
          tokensOut: u?.candidatesTokenCount ?? 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      };
    } catch (e) {
      throw translate(e, req.model);
    }
  },
};

export const geminiEmbeddings: EmbeddingProvider = {
  id: "gemini",
  model: EMBEDDING_MODEL.id,
  dim: EMBEDDING_MODEL.dim,

  async embed(texts, kind) {
    if (texts.length === 0) return { vectors: [], usage: zeroUsage() };

    try {
      const res = await getClient().models.embedContent({
        model: EMBEDDING_MODEL.id,
        contents: texts,
        config: {
          outputDimensionality: EMBEDDING_MODEL.dim,
          taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
        },
      });

      const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== texts.length) {
        throw new LlmError(
          "invalid_output",
          `Embedding soni mos emas: ${vectors.length} / ${texts.length}`,
          { provider: "gemini", model: EMBEDDING_MODEL.id },
        );
      }
      return { vectors, usage: zeroUsage() };
    } catch (e) {
      throw translate(e, EMBEDDING_MODEL.id);
    }
  },
};

function zeroUsage(): Usage {
  return { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
}

/**
 * Gemini SDK'si typed xato sinflarini eksport qilmaydi, shuning uchun
 * status kodini xabar/obyektdan o'qiymiz. Satr taqqoslash emas — obyekt
 * maydonlari, imkon qadar.
 */
function translate(e: unknown, model: string): LlmError {
  if (e instanceof LlmError) return e;
  const ctx = { provider: "gemini", model, cause: e };

  const status = readStatus(e);
  // Provayderning o'z matni ham xabarga qo'shiladi: "API xatosi 404" bilan
  // hech narsa qilib bo'lmaydi, "model ... v1beta da topilmadi" bilan esa
  // darhol ma'lum.
  const detail = errorDetail(e);
  const suffix = detail === "" ? "" : ` — ${detail}`;

  if (status === 429) {
    return new LlmError("rate_limit", `So'rov chegarasi${suffix}`, ctx);
  }
  if (status !== null && status >= 500) {
    return new LlmError("overloaded", `Provayder xatosi ${status}${suffix}`, ctx);
  }
  if (status === 400 && /safety|blocked/i.test(detail)) {
    return new LlmError("refusal", `Model so'rovni rad etdi${suffix}`, ctx);
  }
  if (status !== null) {
    return new LlmError(
      "unknown",
      `API xatosi ${status} (${model})${suffix}`,
      ctx,
    );
  }
  return new LlmError("unknown", `Noma'lum xato (${model})${suffix}`, ctx);
}

function readStatus(e: unknown): number | null {
  if (typeof e !== "object" || e === null) return null;
  const rec = e as Record<string, unknown>;
  for (const key of ["status", "code", "statusCode"]) {
    const v = rec[key];
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  return null;
}
