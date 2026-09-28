import { describe, expect, it } from "vitest";
import { isAbEnabled, pickProvider, primaryProvider } from "@/lib/llm/experiment";
import type { ProviderId } from "@/lib/llm/types";

const both: ProviderId[] = ["anthropic", "gemini"];
const base = { enabled: true, primary: "anthropic" as ProviderId, available: both };

describe("A/B taqsimoti", () => {
  it("bitta documentId doim bitta provayderga tushadi", () => {
    // Bu eng muhim kafolat: hujjatning barcha bosqichlari bitta modelda
    // ketishi kerak, aks holda sifat o'lchovi ma'nosiz.
    const first = pickProvider("hujjat-abc", base);
    for (let i = 0; i < 50; i++) {
      expect(pickProvider("hujjat-abc", base)).toBe(first);
    }
  });

  it("turli hujjatlar ikkala provayderga tushadi", () => {
    const seen = new Set<ProviderId>();
    for (let i = 0; i < 100; i++) seen.add(pickProvider(`hujjat-${i}`, base));
    expect(seen.size).toBe(2);
  });

  it("taqsimot ~50/50", () => {
    let anthropic = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      if (pickProvider(`doc-${i}`, base) === "anthropic") anthropic++;
    }
    // 1000 namunada 40–60 % oralig'i — tasodifiy og'ish uchun keng chegara.
    expect(anthropic).toBeGreaterThan(n * 0.4);
    expect(anthropic).toBeLessThan(n * 0.6);
  });

  it("o'chirilgan bo'lsa doim asosiy provayder", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickProvider(`doc-${i}`, { ...base, enabled: false })).toBe("anthropic");
    }
  });

  it("kalitsiz (tizim chaqiruvi) asosiy provayder", () => {
    expect(pickProvider(undefined, base)).toBe("anthropic");
  });

  it("faqat bittasi sozlangan bo'lsa o'shani tanlaydi", () => {
    const only: ProviderId[] = ["gemini"];
    for (let i = 0; i < 20; i++) {
      expect(pickProvider(`doc-${i}`, { ...base, available: only })).toBe("gemini");
    }
  });

  it("asosiy provayder sozlanmagan bo'lsa mavjudini tanlaydi", () => {
    expect(pickProvider(undefined, { ...base, available: ["gemini"] })).toBe("gemini");
  });

  it("hech biri sozlanmagan bo'lsa asosiyni qaytaradi (xato yuqorida chiqadi)", () => {
    expect(pickProvider("x", { ...base, available: [] })).toBe("anthropic");
  });
});

describe("primaryProvider", () => {
  it("sozlanmagan bo'lsa anthropic", () => {
    expect(primaryProvider({})).toBe("anthropic");
    expect(primaryProvider({ LLM_PRIMARY_PROVIDER: "" })).toBe("anthropic");
  });

  it.each(["anthropic", "gemini"] as const)("%s qiymati qabul qilinadi", (value) => {
    expect(primaryProvider({ LLM_PRIMARY_PROVIDER: value })).toBe(value);
  });

  it("noto'g'ri qiymat JIMGINA default'ga tushmaydi", () => {
    // Bosh harf bilan yozgan odam 100 % Gemini kutib turib, amalda 50/50
    // olardi va buni faqat hisobdan bilardi.
    expect(() => primaryProvider({ LLM_PRIMARY_PROVIDER: "Gemini" })).toThrow(/LLM_PRIMARY_PROVIDER/);
    expect(() => primaryProvider({ LLM_PRIMARY_PROVIDER: "openai" })).toThrow();
  });

  it("gemini asosiy bo'lsa A/B o'chiqda 100 % gemini", () => {
    // 08.1 dagi vaziyat: ANTHROPIC_API_KEY yo'q, hujjatlar yiqilmasligi kerak.
    const primary = primaryProvider({ LLM_PRIMARY_PROVIDER: "gemini" });
    for (let i = 0; i < 20; i++) {
      expect(pickProvider(`doc-${String(i)}`, { enabled: false, primary, available: both })).toBe(
        "gemini",
      );
    }
  });

  it("anthropic zanjirda ZAXIRA bo'lib qoladi", () => {
    // Knob A/B ni o'chiradi, provayderni ro'yxatdan O'CHIRMAYDI.
    const primary = primaryProvider({ LLM_PRIMARY_PROVIDER: "gemini" });
    expect(pickProvider(undefined, { enabled: false, primary, available: ["anthropic"] })).toBe(
      "anthropic",
    );
  });
});

describe("isAbEnabled", () => {
  it('faqat "true" yoqadi', () => {
    expect(isAbEnabled({ LLM_AB_ENABLED: "true" })).toBe(true);
    expect(isAbEnabled({ LLM_AB_ENABLED: "false" })).toBe(false);
    expect(isAbEnabled({ LLM_AB_ENABLED: "1" })).toBe(false);
    expect(isAbEnabled({})).toBe(false);
  });
});
