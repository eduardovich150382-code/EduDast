import { describe, expect, it } from "vitest";
import {
  MODELS,
  TIER_MODELS,
  EMBEDDING_MODEL,
  lowerTier,
  getModel,
} from "@/lib/llm/models";
import {
  costFor,
  costMicros,
  estimateMicros,
  microsToUsd,
} from "@/lib/llm/pricing";
import type { Tier, Usage } from "@/lib/llm/types";

const usage = (u: Partial<Usage>): Usage => ({
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
  cacheWrite: 0,
  ...u,
});

describe("microsToUsd", () => {
  it("6 xonali o'nlik satr qaytaradi", () => {
    expect(microsToUsd(0)).toBe("0.000000");
    expect(microsToUsd(1)).toBe("0.000001");
    expect(microsToUsd(1_000_000)).toBe("1.000000");
    expect(microsToUsd(1_500_000)).toBe("1.500000");
    expect(microsToUsd(12_345_678)).toBe("12.345678");
  });

  it("manfiy qiymatni ham to'g'ri yozadi", () => {
    expect(microsToUsd(-250_000)).toBe("-0.250000");
  });

  it("Decimal(10,6) ustuniga mos — kasr qismi doim 6 xona", () => {
    for (const m of [1, 7, 999_999, 1_000_001]) {
      expect(microsToUsd(m).split(".")[1]).toHaveLength(6);
    }
  });
});

describe("costMicros", () => {
  it("opus-5: 1M kirish = $5, 1M chiqish = $25", () => {
    expect(costMicros("claude-opus-5", usage({ tokensIn: 1_000_000 }))).toBe(
      5_000_000,
    );
    expect(costMicros("claude-opus-5", usage({ tokensOut: 1_000_000 }))).toBe(
      25_000_000,
    );
  });

  it("nol sarf — nol xarajat", () => {
    expect(costMicros("claude-opus-5", usage({}))).toBe(0);
    expect(costFor("claude-opus-5", usage({}))).toBe("0.000000");
  });

  it("kesh o'qish kirishdan 10 barobar arzon", () => {
    const full = costMicros("claude-opus-5", usage({ tokensIn: 1_000_000 }));
    const cached = costMicros("claude-opus-5", usage({ cacheRead: 1_000_000 }));
    expect(cached).toBe(full / 10);
  });

  it("keshga yozish kirishdan 1.25 barobar qimmat", () => {
    const full = costMicros("claude-opus-5", usage({ tokensIn: 1_000_000 }));
    const written = costMicros(
      "claude-opus-5",
      usage({ cacheWrite: 1_000_000 }),
    );
    expect(written).toBe(full * 1.25);
  });

  it("Gemini'da kesh yutug'i va'da qilinmaydi (koeffitsient 1)", () => {
    const full = costMicros("gemini-3.8-flash", usage({ tokensIn: 1_000_000 }));
    const cached = costMicros(
      "gemini-3.8-flash",
      usage({ cacheRead: 1_000_000 }),
    );
    expect(cached).toBe(full);
  });

  it("hamma tarkibiy qism qo'shiladi", () => {
    const c = costMicros(
      "claude-haiku-4-5",
      usage({
        tokensIn: 1000,
        tokensOut: 2000,
        cacheRead: 3000,
        cacheWrite: 4000,
      }),
    );
    // 1000*1 + 2000*5 + 3000*1*0.1 + 4000*1*1.25 = 1000 + 10000 + 300 + 5000
    expect(c).toBe(16_300);
  });

  it("butun son qaytaradi — float qoldig'i yo'q", () => {
    const c = costMicros(
      "claude-sonnet-5",
      usage({ tokensIn: 333, cacheRead: 777 }),
    );
    expect(Number.isInteger(c)).toBe(true);
  });

  it("reyestrda yo'q model — xato, jim 0 emas", () => {
    expect(() => costMicros("gpt-yoq", usage({ tokensIn: 1 }))).toThrow(
      /Narx jadvalida yo'q/,
    );
  });
});

describe("estimateMicros", () => {
  it("chaqiruvdan oldingi baho musbat", () => {
    expect(estimateMicros("claude-opus-5", 10_000, 4_000)).toBeGreaterThan(0);
  });

  it("uzun prompt qimmatroq baholanadi", () => {
    const a = estimateMicros("claude-opus-5", 1_000, 1_000);
    const b = estimateMicros("claude-opus-5", 100_000, 1_000);
    expect(b).toBeGreaterThan(a);
  });

  it("arzon model arzonroq baholanadi", () => {
    const hard = estimateMicros("claude-opus-5", 10_000, 2_000);
    const cheap = estimateMicros("claude-haiku-4-5", 10_000, 2_000);
    expect(cheap).toBeLessThan(hard);
  });
});

describe("model reyestri", () => {
  it("har provayderda uchala daraja to'ldirilgan", () => {
    for (const provider of ["anthropic", "gemini"] as const) {
      for (const tier of ["cheap", "mid", "hard"] as Tier[]) {
        const id = TIER_MODELS[provider][tier];
        expect(id, `${provider}/${tier} bo'sh`).not.toBeNull();
        expect(getModel(id!), `${id} reyestrda yo'q`).toBeDefined();
      }
    }
  });

  it("model yozuvidagi daraja xaritaga mos", () => {
    for (const provider of ["anthropic", "gemini"] as const) {
      for (const tier of ["cheap", "mid", "hard"] as Tier[]) {
        expect(getModel(TIER_MODELS[provider][tier]!)!.tier).toBe(tier);
      }
    }
  });

  it("qimmatroq daraja qimmatroq turadi", () => {
    for (const provider of ["anthropic", "gemini"] as const) {
      const cheap = getModel(TIER_MODELS[provider].cheap!)!;
      const mid = getModel(TIER_MODELS[provider].mid!)!;
      const hard = getModel(TIER_MODELS[provider].hard!)!;
      expect(cheap.inputPerMTok).toBeLessThanOrEqual(mid.inputPerMTok);
      expect(mid.inputPerMTok).toBeLessThanOrEqual(hard.inputPerMTok);
    }
  });

  it("lowerTier cheap'dan pastga tushmaydi", () => {
    expect(lowerTier("hard")).toBe("mid");
    expect(lowerTier("mid")).toBe("cheap");
    expect(lowerTier("cheap")).toBe("cheap");
  });

  it("narxlar musbat va maxOutputTokens belgilangan", () => {
    for (const m of Object.values(MODELS)) {
      expect(m.inputPerMTok, m.id).toBeGreaterThan(0);
      expect(m.outputPerMTok, m.id).toBeGreaterThan(0);
      expect(m.maxOutputTokens, m.id).toBeGreaterThan(0);
    }
  });

  it('tasdiqlangan narxning sanasi bor — "qachon tekshirilgan?" javobsiz qolmasin', () => {
    // `verified: true` bo'lsa-yu sana bo'lmasa, jadval eskirganini hech kim
    // bilmaydi: "3 oydan eski bo'lsa tekshiring" qoidasi sanasiz ishlamaydi.
    for (const m of Object.values(MODELS)) {
      if (m.verified) {
        expect(m.priceVerifiedOn, `${m.id}: verified, lekin sana yo'q`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      }
    }
  });

  it("ID tasdig'i narx tasdig'i bilan chalkashmaydi", () => {
    // `pnpm llm:models` faqat ID ni tekshiradi — narx haqida hech narsa
    // aytmaydi. Ikkalasi bitta maydonga yig'ilib qolmasin.
    const embedOnlyId = EMBEDDING_MODEL.idVerifiedOn !== undefined;
    expect(embedOnlyId && EMBEDDING_MODEL.verified).toBe(false);
  });
});
