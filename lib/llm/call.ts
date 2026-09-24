import { checkBudget } from "@/lib/budget/guard";
import { LlmError } from "./errors";
import { isAbEnabled, pickProvider } from "./experiment";
import { writeLlmCall } from "./log";
import { getModel } from "./models";
import { costFor, estimateMicros } from "./pricing";
import { buildChain, shouldAdvance, tierForVerdict } from "./router";
import { availableProviders, getProvider } from "./providers/registry";
import { usageFromError } from "./providers/fake";
import { parseStructured, toJsonSchema } from "./structured";
import type { LlmRequest, LlmResult, ProviderId, Usage } from "./types";

/**
 * Har LLM chaqiruvining yagona o'tish nuqtasi.
 *
 * Oqim: byudjet tekshiruvi → provayder tanlash → zanjir bo'ylab urinish →
 * HAR urinish uchun jurnal yozish → Zod bilan tekshirish.
 *
 * CLAUDE.md 3 va 5-qoidalari shu funksiya ichida bajariladi. Feature kodi
 * byudjetni ham, jurnalni ham o'zi qilmaydi — shuning uchun ularni unutish
 * mumkin emas.
 */

const PRIMARY_PROVIDER: ProviderId = "anthropic";
/** Chegaralanganda `retry-after` o'rniga ishlatiladigan kutish. */
const RATE_LIMIT_PAUSE_MS = 1_500;

export async function runLlm<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
  const available = availableProviders();
  const provider = pickProvider(req.documentId, {
    enabled: isAbEnabled(),
    primary: PRIMARY_PROVIDER,
    available,
  });

  // Byudjet tekshiruvi zanjirning BIRINCHI modeli narxiga qarab qilinadi.
  // Zanjir pastga tushsa narx faqat kamayadi, ya'ni baho ehtiyotkor.
  const firstChain = buildChain({ primary: provider, available, tier: req.tier });
  const promptChars = measurePrompt(req);
  const maxOut = req.maxOutputTokens ?? defaultMaxOut(firstChain[0]!.model);

  const verdict = await checkBudget({
    userId: req.userId,
    provider: firstChain[0]!.provider,
    modelId: firstChain[0]!.model,
    estimateUsd: estimateMicros(firstChain[0]!.model, promptChars, maxOut) / 1e6,
  });

  if (verdict.kind === "deny") {
    throw new LlmError(
      verdict.reason === "disabled" ? "disabled" : "budget",
      `Byudjet shifti: ${verdict.reason}`,
    );
  }

  const chain = buildChain({
    primary: provider,
    available,
    tier: tierForVerdict(req.tier, verdict),
  });

  const jsonSchema = toJsonSchema(req.schema);
  let lastError: LlmError | null = null;
  let rateLimitRetried = false;

  for (let i = 0; i < chain.length; i++) {
    const attempt = chain[i]!;
    const attemptMaxOut = req.maxOutputTokens ?? defaultMaxOut(attempt.model);

    try {
      const res = await getProvider(attempt.provider).generate({
        model: attempt.model,
        system: req.system,
        messages: req.messages,
        jsonSchema,
        maxOutputTokens: attemptMaxOut,
        effort: req.effort ?? "high",
      });

      // Jurnal PARSE'DAN OLDIN yoziladi: sxemaga mos kelmagan javob ham pul
      // turgan, demak u ham hisobga tushishi kerak.
      const llmCallId = await writeLlmCall({
        userId: req.userId,
        documentId: req.documentId,
        provider: attempt.provider,
        model: attempt.model,
        usage: res.usage,
        purpose: req.purpose,
      });

      const data = parseStructured(req.schema, res.rawJson, {
        provider: attempt.provider,
        model: attempt.model,
      });

      return {
        data,
        model: attempt.model,
        provider: attempt.provider,
        usage: res.usage,
        costUsd: costFor(attempt.model, res.usage),
        llmCallId,
      };
    } catch (e) {
      const err = e instanceof LlmError ? e : wrap(e, attempt.model);
      lastError = err;

      // Apiga yetib borgan har urinish jurnalga tushadi — yonib ketgan,
      // lekin yozilmagan chaqiruv aynan 3-qoida oldini olmoqchi bo'lgan
      // marja oqishi.
      const usage = usageFromError(e);
      if (usage) {
        await writeLlmCall({
          userId: req.userId,
          documentId: req.documentId,
          provider: attempt.provider,
          model: attempt.model,
          usage,
          purpose: req.purpose,
        });
      }

      if (!shouldAdvance(err)) throw err;

      // Chegaralanishda bir marta o'sha modelda qayta urinamiz — bu ko'pincha
      // vaqtinchalik va zanjirdan pastga tushish sifatni bekorga pasaytiradi.
      if (err.kind === "rate_limit" && !rateLimitRetried) {
        rateLimitRetried = true;
        await sleep(RATE_LIMIT_PAUSE_MS);
        i--;
        continue;
      }
    }
  }

  throw lastError ?? new LlmError("unknown", "Zanjir bo'sh");
}

function wrap(e: unknown, model: string): LlmError {
  return new LlmError("unknown", "Kutilmagan xato", { model, cause: e });
}

function measurePrompt<T>(req: LlmRequest<T>): number {
  let n = 0;
  for (const p of req.system) n += p.text.length;
  for (const m of req.messages) n += m.content.length;
  return n;
}

function defaultMaxOut(modelId: string): number {
  return Math.min(8_000, getModel(modelId)?.maxOutputTokens ?? 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type { Usage };
