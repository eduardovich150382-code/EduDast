import Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "../errors";
import { getModel } from "../models";
import type { LlmProvider, ProviderRequest, ProviderResult } from "../types";

/**
 * Anthropic adapteri.
 *
 * Bu — `@anthropic-ai/sdk` import qilinishi RUXSAT ETILGAN yagona joylardan
 * biri (`tests/llm-guard.test.ts` tekshiradi). SDK turlari bu fayldan
 * tashqariga chiqmaydi.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmError("not_configured", "ANTHROPIC_API_KEY sozlanmagan", {
      provider: "anthropic",
    });
  }
  client ??= new Anthropic({ apiKey });
  return client;
}

/** Faqat testlar uchun — kesh qilingan clientni tozalaydi. */
export function resetAnthropicClient(): void {
  client = null;
}

export const anthropicProvider: LlmProvider = {
  id: "anthropic",

  async generate(req: ProviderRequest): Promise<ProviderResult> {
    const model = getModel(req.model);
    if (!model) {
      throw new LlmError("unknown", `Reyestrda yo'q model: ${req.model}`, {
        provider: "anthropic",
      });
    }

    // System qismlari: keshlanadigan qismga `cache_control` qo'yiladi.
    // Tartib `req.system` dan keladi — barqarordan o'zgaruvchanga.
    const system = req.system.map((part) => ({
      type: "text" as const,
      text: part.text,
      ...(part.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));

    // Fikrlash rejimi modelga bog'liq: 4.6+ da `adaptive`, eskisida
    // `budget_tokens`. `budget_tokens` ni yangi modelga yuborish 400 beradi.
    const thinking =
      model.thinkingStyle === "adaptive"
        ? ({ type: "adaptive" } as const)
        : ({
            type: "enabled",
            budget_tokens: Math.min(4096, Math.floor(req.maxOutputTokens / 2)),
          } as const);

    try {
      // Assistant prefill ISHLATILMAYDI — joriy modellarda 400 qaytaradi.
      // Formatni `output_config.format` boshqaradi.
      const res = await getClient().messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        thinking,
        output_config: {
          effort: req.effort,
          format: {
            type: "json_schema",
            schema: req.jsonSchema,
          },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (res.stop_reason === "refusal") {
        throw new LlmError("refusal", "Model so'rovni rad etdi", {
          provider: "anthropic",
          model: req.model,
        });
      }

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return {
        rawJson: text,
        usage: {
          tokensIn: res.usage.input_tokens ?? 0,
          tokensOut: res.usage.output_tokens ?? 0,
          cacheRead: res.usage.cache_read_input_tokens ?? 0,
          cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (e) {
      throw translate(e, req.model);
    }
  },
};

function translate(e: unknown, model: string): LlmError {
  if (e instanceof LlmError) return e;
  const ctx = { provider: "anthropic", model, cause: e };

  if (e instanceof Anthropic.RateLimitError) {
    return new LlmError("rate_limit", "So'rov chegarasi", ctx);
  }
  if (e instanceof Anthropic.APIError) {
    if (e.status !== undefined && e.status >= 500) {
      return new LlmError("overloaded", `Provayder xatosi ${e.status}`, ctx);
    }
    return new LlmError("unknown", `API xatosi ${e.status ?? "?"}`, ctx);
  }
  return new LlmError("unknown", "Noma'lum xato", ctx);
}
