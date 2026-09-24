import type { BudgetVerdict } from "@/lib/budget/guard";
import { LlmError } from "./errors";
import { TIER_MODELS, lowerTier } from "./models";
import type { ProviderId, Tier } from "./types";

/**
 * Qaysi provayder va model bilan chaqirish.
 *
 * Ikki bosqichli: (1) byudjet hukmi darajani belgilaydi, (2) ish vaqtidagi
 * xatolar zaxira zanjiri bo'ylab pastga tushiradi.
 */

export type Attempt = { provider: ProviderId; model: string; tier: Tier };

/** Byudjet hukmidan boshlang'ich darajani chiqaradi. */
export function tierForVerdict(tier: Tier, verdict: BudgetVerdict): Tier {
  if (verdict.kind === "downgrade") return lowerTier(tier);
  return tier;
}

/**
 * Urinishlar zanjiri.
 *
 * Tartib: (1) tanlangan provayder, so'ralgan daraja; (2) o'sha provayder,
 * bir pog'ona past; (3) ikkinchi provayder, so'ralgan daraja; (4) ikkinchi
 * provayder, bir pog'ona past.
 *
 * NEGA IKKINCHI PROVAYDER ZANJIRDA: bitta provayder butunlay ishlamay
 * qolsa (avariya, kalit muddati tugashi) generatsiya to'xtab qolmasligi
 * kerak. Ikkita provayderni kunning boshidan ulashning ikkinchi foydasi shu.
 */
export function buildChain(opts: {
  primary: ProviderId;
  available: readonly ProviderId[];
  tier: Tier;
}): Attempt[] {
  const order: ProviderId[] = [
    opts.primary,
    ...opts.available.filter((p) => p !== opts.primary),
  ].filter((p) => opts.available.includes(p));

  const chain: Attempt[] = [];
  for (const provider of order) {
    for (const tier of [opts.tier, lowerTier(opts.tier)]) {
      const model = TIER_MODELS[provider]?.[tier];
      if (!model) continue;
      if (chain.some((a) => a.provider === provider && a.model === model)) continue;
      chain.push({ provider, model, tier });
    }
  }

  if (chain.length === 0) {
    throw new LlmError(
      "not_configured",
      "Birorta provayder sozlanmagan (ANTHROPIC_API_KEY / GOOGLE_API_KEY)",
    );
  }
  return chain;
}

/**
 * Xatodan keyin zanjirda davom etish kerakmi.
 *
 * `refusal` — kontent qarori, boshqa modelda ham takrorlanadi va
 * qayta urinish faqat pul kuydiradi.
 * `invalid_output` — bir marta boshqa modelda sinab ko'rishga arziydi.
 * `budget`/`disabled`/`not_configured` — zanjir yordam bermaydi.
 */
export function shouldAdvance(error: LlmError): boolean {
  switch (error.kind) {
    case "rate_limit":
    case "overloaded":
    case "invalid_output":
    case "unknown":
      return true;
    case "refusal":
    case "budget":
    case "disabled":
    case "not_configured":
      return false;
  }
}
