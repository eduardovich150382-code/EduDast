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
  /**
   * Xato. Sukut bo'yicha usage xatoga ilova qilinadi (ba'zi provayderlar
   * shunday qiladi). `noUsage: true` — haqiqiy SDK'larning odatiy holati:
   * token soni umuman noma'lum.
   */
  | { kind: "error"; error: LlmErrorKind; usage?: Partial<Usage>; noUsage?: boolean };

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
      if (step.noUsage !== true) {
        (err as LlmError & { usage?: Usage }).usage = fullUsage(step.usage);
      }
      throw err;
    }
    return { rawJson: step.rawJson, usage: fullUsage(step.usage) };
  }
}
