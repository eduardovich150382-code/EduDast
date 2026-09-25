import { LlmError, type LlmErrorKind } from "../errors";
import type { LlmProvider, ProviderRequest, ProviderResult, Usage } from "../types";

/**
 * Testlar uchun deterministik provayder.
 *
 * Haqiqiy tarmoqqa chiqmaydi. Testda kutilgan javoblarni navbatga qo'yib,
 * qatlamning o'zini (jurnal, marshrutlash, kredit) tekshirish uchun.
 */

export type FakeStep =
  | { kind: "ok"; rawJson: string; usage?: Partial<Usage> }
  /** Xato, LEKIN usage qaytgan — jurnal baribir yozilishi kerak. */
  | { kind: "error"; error: LlmErrorKind; usage?: Partial<Usage> };

const fullUsage = (u?: Partial<Usage>): Usage => ({
  tokensIn: u?.tokensIn ?? 100,
  tokensOut: u?.tokensOut ?? 50,
  cacheRead: u?.cacheRead ?? 0,
  cacheWrite: u?.cacheWrite ?? 0,
});

export class FakeProvider implements LlmProvider {
  readonly id = "fake" as const;
  readonly calls: ProviderRequest[] = [];
  private steps: FakeStep[] = [];

  /** Navbatdagi javoblarni belgilaydi. Tugasa oxirgisi takrorlanadi. */
  queue(...steps: FakeStep[]): this {
    this.steps = steps;
    return this;
  }

  reset(): void {
    this.steps = [];
    this.calls.length = 0;
  }

  async generate(req: ProviderRequest): Promise<ProviderResult> {
    this.calls.push(req);
    const step = this.steps[this.calls.length - 1] ?? this.steps.at(-1);

    if (!step) {
      return { rawJson: "{}", usage: fullUsage() };
    }
    if (step.kind === "error") {
      const err = new LlmError(step.error, `fake: ${step.error}`, {
        provider: "fake",
        model: req.model,
      });
      // Usage'ni xatoga ilova qilamiz: `call.ts` uni jurnalga yozishi kerak.
      (err as LlmError & { usage?: Usage }).usage = fullUsage(step.usage);
      throw err;
    }
    return { rawJson: step.rawJson, usage: fullUsage(step.usage) };
  }
}

/** Xatoga ilova qilingan usage'ni o'qiydi (fake va haqiqiy provayderlar uchun). */
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
