import { z } from "zod";
import { LlmError } from "./errors";

/**
 * Strukturali chiqish.
 *
 * Provayder tomonidagi sxema majburlashi — OPTIMIZATSIYA. Shartnoma esa
 * bizning Zod parse: model sxemani "deyarli" bajarsa ham, bazaga faqat
 * tekshirilgan ma'lumot tushadi.
 */

/** Zod sxemasini JSON Schema'ga aylantiradi (Zod 4 da o'rnatilgan). */
export function toJsonSchema(schema: z.ZodType<unknown>): unknown {
  return z.toJSONSchema(schema, { io: "output" });
}

/**
 * Model qaytargan xom matnni parse qiladi.
 *
 * Ba'zi modellar JSON'ni ```json ... ``` blokiga o'rab qaytaradi, garchi
 * so'ralmagan bo'lsa ham. Shuni tozalaymiz — aks holda mukammal javob
 * faqat o'ram sababli rad etilib, kredit qaytarilgan bo'lardi.
 */
export function parseStructured<T>(
  schema: z.ZodType<T>,
  raw: string,
  ctx: { provider: string; model: string },
): T {
  const cleaned = stripCodeFence(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (cause) {
    throw new LlmError("invalid_output", "Javob JSON emas", { ...ctx, cause });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LlmError(
      "invalid_output",
      `Javob sxemaga mos emas: ${summarizeIssues(parsed.error)}`,
      ctx,
    );
  }
  return parsed.data;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```(?:json)?\s*\n?/i, "");
  return withoutOpen.replace(/\n?```\s*$/, "").trim();
}

/**
 * Xato matnini qisqartiradi. To'liq Zod xatosi juda uzun bo'lishi mumkin
 * va u Sentry'ga hamda foydalanuvchiga ko'rinadigan xabarga tushadi —
 * model qaytargan MAZMUN xato matniga chiqib ketmasligi uchun faqat yo'l
 * va turni ko'rsatamiz, qiymatni emas.
 */
function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "<ildiz>"}: ${i.code}`)
    .join("; ");
}
