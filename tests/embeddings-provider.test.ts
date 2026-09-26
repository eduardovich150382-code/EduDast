import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "@/lib/llm/errors";
import type { EmbeddingProvider, Usage } from "@/lib/llm/types";

/**
 * `lib/llm/embeddings.ts` — partiyalash va xarajat jurnali.
 *
 * ENG MUHIM TEKSHIRUVLAR:
 *   1. 96 dan katta ro'yxat bo'linadi va TARTIB saqlanadi. Tartib buzilsa
 *      mavzuga BOSHQA mavzuning vektori yoziladi — xato bermaydi, qidiruv
 *      shunchaki tasodifiy javob qaytara boshlaydi.
 *   2. O'rtadagi partiya yiqilsa YARIM NATIJA qaytmaydi (o'sha sabab).
 *   3. Har partiya `LlmCall` ga yoziladi (CLAUDE.md 3-qoida), yiqilgani ham.
 */

const mocks = vi.hoisted(() => ({ writeLlmCall: vi.fn() }));

vi.mock("@/lib/llm/log", () => ({ writeLlmCall: mocks.writeLlmCall }));

const ZERO: Usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };

/** Normallashtirish o'tishi uchun nol bo'lmagan vektor kerak. */
function vectorFor(text: string, dim = 768): number[] {
  const out = new Array<number>(dim).fill(0.001);
  // Matnni vektorga qadaymiz: tartib tekshiruvida kim kimga tegishli
  // ekanini bilish uchun.
  out[0] = text.length + 1;
  return out;
}

type Step = { kind: "ok" } | { kind: "error"; error: LlmError };

/** Soxta provayder — chaqiruvlarni yozib boradi, navbat bilan javob beradi. */
class FakeEmbeddings implements EmbeddingProvider {
  id = "fake-embed";
  model = "gemini-embedding-001";
  dim = 768;

  calls: { texts: string[]; kind: "document" | "query" }[] = [];
  private steps: Step[] = [];
  /** `dim` dan boshqa uzunlik qaytarish — assertDim ni sinash uchun. */
  badDim: number | null = null;

  queue(...steps: Step[]): void {
    this.steps.push(...steps);
  }

  async embed(texts: string[], kind: "document" | "query") {
    this.calls.push({ texts: [...texts], kind });

    const step = this.steps.shift() ?? { kind: "ok" as const };
    if (step.kind === "error") throw step.error;

    return {
      vectors: texts.map((t) => vectorFor(t, this.badDim ?? this.dim)),
      usage: { ...ZERO, tokensIn: texts.length * 10 },
    };
  }
}

let fake: FakeEmbeddings;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.writeLlmCall.mockResolvedValue("llmcall-1");

  fake = new FakeEmbeddings();
  const { setEmbeddingProvider } = await import("@/lib/llm/embeddings");
  setEmbeddingProvider(fake);
});

afterEach(async () => {
  const { setEmbeddingProvider } = await import("@/lib/llm/embeddings");
  setEmbeddingProvider(null);
});

function texts(n: number): string[] {
  // Har matn boshqa uzunlikda — vectorFor ular orasini ajratadi.
  return Array.from({ length: n }, (_, i) => "m".repeat(i + 1));
}

describe("partiyalash", () => {
  it("97 matn → 2 so'rov (96 + 1)", async () => {
    const { embedTexts, EMBED_BATCH } = await import("@/lib/llm/embeddings");
    expect(EMBED_BATCH).toBe(96);

    const out = await embedTexts(texts(97));

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]!.texts).toHaveLength(96);
    expect(fake.calls[1]!.texts).toHaveLength(1);
    expect(out).toHaveLength(97);
  });

  it.each([
    [0, 0],
    [1, 1],
    [95, 1],
    [96, 1],
    [97, 2],
    [192, 2],
    [193, 3],
  ])("%i matn → %i so'rov", async (count, expected) => {
    const { embedTexts } = await import("@/lib/llm/embeddings");

    const out = await embedTexts(texts(count));

    expect(fake.calls).toHaveLength(expected);
    expect(out).toHaveLength(count);
  });

  it("bo'sh massivda provayderga UMUMAN tegilmaydi", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");

    expect(await embedTexts([])).toEqual([]);
    expect(fake.calls).toHaveLength(0);
    expect(mocks.writeLlmCall).not.toHaveBeenCalled();
  });

  it("TARTIB saqlanadi — partiya chegarasida ham", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    const input = texts(200);

    const out = await embedTexts(input);

    // vectorFor birinchi elementga matn uzunligini qadaydi; normallashtirishdan
    // keyin ham eng katta komponent o'sha bo'lib qoladi, shuning uchun
    // nisbatni tekshiramiz: har vektor O'Z matniga tegishli bo'lishi kerak.
    for (const [i, vector] of out.entries()) {
      const expected = vectorFor(input[i]!);
      const scale = expected[0]! / vector[0]!;
      expect(expected[1]! / vector[1]!).toBeCloseTo(scale, 6);
    }
  });

  it("hujjat uchun 'document', so'rov uchun 'query' turi yuboriladi", async () => {
    const { embedTexts, embedQuery } = await import("@/lib/llm/embeddings");

    await embedTexts(["a"]);
    await embedQuery("b");

    expect(fake.calls[0]!.kind).toBe("document");
    expect(fake.calls[1]!.kind).toBe("query");
  });
});

describe("xato — yarim natija qaytmaydi", () => {
  it("ikkinchi partiya yiqilsa throw qiladi, birinchisi TASHLANADI", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    fake.queue({ kind: "ok" }, { kind: "error", error: new LlmError("rate_limit", "chegara") });

    await expect(embedTexts(texts(150))).rejects.toThrow(LlmError);

    // Ikkita so'rov ketgan, lekin chaqiruvchi hech qanday vektor olmagan:
    // yarim massiv indekslarni siljitib, mavzuga boshqa mavzuning
    // vektorini yozdirardi.
    expect(fake.calls).toHaveLength(2);
  });

  it("noto'g'ri o'lchamda rad etadi (bazaga tushmasin)", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    fake.badDim = 1536;

    await expect(embedTexts(["a"])).rejects.toThrow(/Vektor o'lchami 1536/);
  });
});

describe("LlmCall jurnali (CLAUDE.md 3-qoida)", () => {
  it("har partiya alohida yoziladi", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");

    await embedTexts(texts(97));

    expect(mocks.writeLlmCall).toHaveBeenCalledTimes(2);
    const first = mocks.writeLlmCall.mock.calls[0]![0] as Record<string, unknown>;
    expect(first).toMatchObject({
      provider: "gemini",
      model: "gemini-embedding-001",
      purpose: "embed-document",
      userId: null,
    });
    expect((first.usage as Usage).tokensIn).toBe(960);
  });

  it("so'rov yo'lida purpose 'embed-query'", async () => {
    const { embedQuery } = await import("@/lib/llm/embeddings");

    await embedQuery("Fizikada tezlik nima?");

    expect(mocks.writeLlmCall.mock.calls[0]![0]).toMatchObject({ purpose: "embed-query" });
  });

  it("purpose va userId uzatilsa ular ishlatiladi", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");

    await embedTexts(["a"], { userId: "user-1", purpose: "embed-topic" });

    expect(mocks.writeLlmCall.mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      purpose: "embed-topic",
    });
  });

  it("YIQILGAN urinish ham yoziladi — errorKind bilan, token nol", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    fake.queue({ kind: "error", error: new LlmError("overloaded", "band") });

    await expect(embedTexts(["a"])).rejects.toThrow();

    expect(mocks.writeLlmCall).toHaveBeenCalledTimes(1);
    expect(mocks.writeLlmCall.mock.calls[0]![0]).toMatchObject({
      errorKind: "overloaded",
      usage: ZERO,
    });
  });

  /**
   * `not_configured` — tarmoqqa UMUMAN chiqilmagan, ya'ni xarajat ham yo'q.
   * `lib/llm/call.ts` dagi qoidaning aynan o'zi.
   */
  it("not_configured da jurnal YOZILMAYDI", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    fake.queue({ kind: "error", error: new LlmError("not_configured", "kalit yo'q") });

    await expect(embedTexts(["a"])).rejects.toThrow(/kalit yo'q/);

    expect(mocks.writeLlmCall).not.toHaveBeenCalled();
  });

  it("LlmError bo'lmagan xato 'unknown' deb yoziladi", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    fake.queue({ kind: "error", error: new TypeError("kutilmagan") as unknown as LlmError });

    await expect(embedTexts(["a"])).rejects.toThrow(TypeError);

    expect(mocks.writeLlmCall.mock.calls[0]![0]).toMatchObject({ errorKind: "unknown" });
  });

  it("jurnal uzatilgan db bilan yoziladi (CLI skriptlar uchun)", async () => {
    const { embedTexts } = await import("@/lib/llm/embeddings");
    const db = { llmCall: {} } as never;

    await embedTexts(["a"], { db });

    expect(mocks.writeLlmCall.mock.calls[0]![1]).toBe(db);
  });
});
