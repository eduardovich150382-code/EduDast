import type { ProviderId } from "@/lib/llm/types";
import { getModel } from "@/lib/llm/models";
import { readLimits, type BudgetLimits, type EnvLike } from "./limits";
import { readSpend, type SpendSnapshot } from "./spend";

/**
 * Byudjet shifti (CLAUDE.md, 5-qoida).
 *
 * MUHIM: bu funksiya FAQAT `lib/llm/call.ts` ichidan chaqiriladi, feature
 * kodidan emas. Agar har generator o'zi tekshirsa, ertami-kechmi biri
 * unutiladi va shift teshik bo'lib qoladi.
 */

export type BudgetVerdict =
  | { kind: "full" }
  | { kind: "downgrade"; reason: BudgetReason }
  | { kind: "deny"; reason: BudgetReason };

export type BudgetReason =
  | "monthly"
  | "daily"
  | "user-daily"
  | "free-quota"
  | "disabled";

export type BudgetInput = {
  limits: BudgetLimits;
  spend: SpendSnapshot;
  /** Ushbu chaqiruvning taxminiy narxi (dollarda). */
  estimateUsd: number;
  /** Chaqiruv qaysi provayderga ketmoqda — bepul kvota tekshiruvi uchun. */
  provider: ProviderId;
  /** Provayderning bugungi bepul kvotasi, `null` — kvota yo'q. */
  freeTierRpd: number | null;
};

/**
 * Sof qaror funksiyasi — bazaga bormaydi, vaqtni o'zi o'qimaydi.
 * Shuning uchun har chegarani testda aniq sinash mumkin.
 */
export function decideBudget(input: BudgetInput): BudgetVerdict {
  const { limits, spend, estimateUsd } = input;

  if (!limits.generationEnabled) {
    return { kind: "deny", reason: "disabled" };
  }

  // Har uchala shiftni ko'rib chiqamiz va ENG QAT'IY hukmni qaytaramiz.
  const checks: { reason: BudgetReason; used: number; limit: number | null }[] = [
    { reason: "monthly", used: spend.monthUsd, limit: limits.monthlyUsd },
    { reason: "daily", used: spend.dayUsd, limit: limits.dailyUsd },
    { reason: "user-daily", used: spend.userDayUsd, limit: limits.userDailyUsd },
  ];

  let downgrade: BudgetReason | null = null;

  for (const c of checks) {
    if (c.limit === null) continue;
    if (c.limit === 0) return { kind: "deny", reason: c.reason };

    const ratio = (c.used + estimateUsd) / c.limit;
    if (ratio >= limits.denyAt) return { kind: "deny", reason: c.reason };
    if (ratio >= limits.downgradeAt) downgrade ??= c.reason;
  }

  // Bepul kvota tugashi — XATO EMAS, arzonlashtirish sababi. Marshrutlovchi
  // buni ko'rib boshqa provayderga o'tadi.
  if (input.freeTierRpd !== null) {
    const used = spend.providerDayCalls[input.provider] ?? 0;
    if (used >= input.freeTierRpd) downgrade ??= "free-quota";
  }

  return downgrade ? { kind: "downgrade", reason: downgrade } : { kind: "full" };
}

/**
 * Keshlangan global summalar.
 *
 * NEGA KESH: har generatsiya bosqichi shift tekshiradi, ya'ni bitta hujjat
 * uchun 3 marta `SUM(costUsd)`. Bu so'rov `@@index([createdAt])` bilan ham
 * jadval o'sgani sari qimmatlashadi.
 *
 * NEGA 0.8 DAN YUQORIDA KESH CHETLAB O'TILADI: shiftga yaqin joyda 60
 * soniyalik eski ma'lumot bilan qaror qilish — aynan shiftdan oshib
 * ketishning yo'li. Foydalanuvchi-kunlik summa umuman keshlanmaydi: u
 * kichik indeksli so'rov va aynan uni suiiste'mol qilish mumkin.
 */
const GLOBAL_CACHE_TTL_MS = 60_000;
let cache: { at: number; snapshot: SpendSnapshot; ratio: number } | null = null;

/** Faqat testlar uchun. */
export function resetBudgetCache(): void {
  cache = null;
}

export async function checkBudget(opts: {
  userId: string | null;
  provider: ProviderId;
  modelId: string;
  estimateUsd: number;
  now?: Date;
  env?: EnvLike;
}): Promise<BudgetVerdict> {
  const now = opts.now ?? new Date();
  const limits = readLimits(opts.env);
  const model = getModel(opts.modelId);

  const fresh =
    cache === null ||
    now.getTime() - cache.at > GLOBAL_CACHE_TTL_MS ||
    cache.ratio > limits.downgradeAt;

  let spend: SpendSnapshot;
  if (fresh) {
    spend = await readSpend({ userId: opts.userId, now });
    const ratio = limits.monthlyUsd ? spend.monthUsd / limits.monthlyUsd : 0;
    cache = { at: now.getTime(), snapshot: spend, ratio };
  } else {
    // Keshdan global summalar, foydalanuvchi summasi esa doim yangi.
    const userSpend = await readSpend({ userId: opts.userId, now });
    spend = { ...cache!.snapshot, userDayUsd: userSpend.userDayUsd };
  }

  return decideBudget({
    limits,
    spend,
    estimateUsd: opts.estimateUsd,
    provider: opts.provider,
    freeTierRpd: model?.freeTierRpd ?? null,
  });
}
