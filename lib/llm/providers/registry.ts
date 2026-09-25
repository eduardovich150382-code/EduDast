import type { EnvLike } from "@/lib/budget/limits";
import type { LlmProvider, ProviderId } from "../types";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";

/**
 * Provayder reyestri.
 *
 * Adapterlar FAQAT shu yerda ro'yxatga olinadi. Kod qolgan qismi
 * `getProvider(id)` orqali ishlaydi va SDK'ni ko'rmaydi.
 */

const providers: Partial<Record<ProviderId, LlmProvider>> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/** Faqat testlar uchun: soxta provayderni qo'shadi/olib tashlaydi. */
export function setProvider(id: ProviderId, p: LlmProvider | null): void {
  if (p === null) delete providers[id];
  else providers[id] = p;
}

export function getProvider(id: ProviderId): LlmProvider {
  const p = providers[id];
  if (!p) throw new Error(`Ro'yxatda yo'q provayder: ${id}`);
  return p;
}

/**
 * Kaliti sozlangan provayderlar. Kalitisiz provayder A/B taqsimotiga
 * kirmaydi — aks holda hujjatlarning yarmi "sozlanmagan" xatosi bilan
 * yiqilardi.
 */
export function availableProviders(env: EnvLike = process.env): ProviderId[] {
  const out: ProviderId[] = [];
  if (env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (env.GOOGLE_API_KEY) out.push("gemini");
  if (providers.fake) out.push("fake");
  return out;
}
