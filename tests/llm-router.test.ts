import { describe, expect, it } from "vitest";
import { LlmError } from "@/lib/llm/errors";
import { buildChain, shouldAdvance, tierForVerdict } from "@/lib/llm/router";
import type { BudgetVerdict } from "@/lib/budget/guard";
import type { ProviderId, Tier } from "@/lib/llm/types";

const both: ProviderId[] = ["anthropic", "gemini"];

describe("tierForVerdict", () => {
  const cases: [Tier, BudgetVerdict["kind"], Tier][] = [
    ["hard", "full", "hard"],
    ["mid", "full", "mid"],
    ["cheap", "full", "cheap"],
    ["hard", "downgrade", "mid"],
    ["mid", "downgrade", "cheap"],
    ["cheap", "downgrade", "cheap"],
  ];

  it.each(cases)("%s daraja + %s hukm = %s", (tier, kind, expected) => {
    const verdict = (
      kind === "downgrade" ? { kind, reason: "monthly" } : { kind }
    ) as BudgetVerdict;
    expect(tierForVerdict(tier, verdict)).toBe(expected);
  });
});

describe("buildChain", () => {
  it("asosiy provayderdan boshlanadi", () => {
    const chain = buildChain({ primary: "gemini", available: both, tier: "hard" });
    expect(chain[0]!.provider).toBe("gemini");
  });

  it("avval o'z provayderida pastga tushadi, keyin ikkinchisiga o'tadi", () => {
    const chain = buildChain({ primary: "anthropic", available: both, tier: "hard" });
    expect(chain.map((a) => `${a.provider}/${a.tier}`)).toEqual([
      "anthropic/hard",
      "anthropic/mid",
      "gemini/hard",
      "gemini/mid",
    ]);
  });

  it("cheap darajada takroriy model qo'shilmaydi", () => {
    const chain = buildChain({ primary: "anthropic", available: ["anthropic"], tier: "cheap" });
    // cheap dan pastga tushib bo'lmaydi — bitta urinish qoladi.
    expect(chain).toHaveLength(1);
    expect(chain[0]!.model).toBe("claude-haiku-4-5");
  });

  it("faqat bitta provayder sozlangan bo'lsa zanjir qisqaradi", () => {
    const chain = buildChain({ primary: "anthropic", available: ["anthropic"], tier: "hard" });
    expect(chain).toHaveLength(2);
    expect(chain.every((a) => a.provider === "anthropic")).toBe(true);
  });

  it("hech biri sozlanmagan bo'lsa aniq xato", () => {
    expect(() => buildChain({ primary: "anthropic", available: [], tier: "hard" })).toThrow(
      /sozlanmagan/,
    );
  });

  it("zanjirdagi har model reyestrdan", () => {
    const chain = buildChain({ primary: "anthropic", available: both, tier: "hard" });
    for (const a of chain) expect(a.model).toBeTruthy();
  });
});

describe("shouldAdvance", () => {
  it("vaqtinchalik xatolarda zanjir davom etadi", () => {
    for (const kind of ["rate_limit", "overloaded", "invalid_output", "unknown"] as const) {
      expect(shouldAdvance(new LlmError(kind, "x")), kind).toBe(true);
    }
  });

  it("refusal'da davom etmaydi — kontent qarori boshqa modelda ham takrorlanadi", () => {
    expect(shouldAdvance(new LlmError("refusal", "x"))).toBe(false);
  });

  it("byudjet va sozlama xatolarida zanjir yordam bermaydi", () => {
    for (const kind of ["budget", "disabled", "not_configured"] as const) {
      expect(shouldAdvance(new LlmError(kind, "x")), kind).toBe(false);
    }
  });

  it("retryable bayrog'i xato turiga mos", () => {
    expect(new LlmError("rate_limit", "x").retryable).toBe(true);
    expect(new LlmError("refusal", "x").retryable).toBe(false);
  });
});
