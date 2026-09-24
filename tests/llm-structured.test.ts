import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStructured, toJsonSchema } from "@/lib/llm/structured";
import { l2Normalize, assertDim } from "@/lib/llm/embeddings";

const ctx = { provider: "fake", model: "test" };
const Schema = z.object({ javob: z.string(), ball: z.number().min(0).max(1) });

describe("toJsonSchema", () => {
  it("Zod sxemasidan JSON Schema yasaydi", () => {
    const js = toJsonSchema(Schema) as Record<string, unknown>;
    expect(js.type).toBe("object");
    expect(Object.keys(js.properties as object)).toEqual(["javob", "ball"]);
  });

  it("ichma-ich sxema ham ishlaydi", () => {
    const Nested = z.object({ bloklar: z.array(z.object({ turi: z.string() })) });
    const js = toJsonSchema(Nested) as Record<string, unknown>;
    expect(js.type).toBe("object");
  });
});

describe("parseStructured", () => {
  it("toza JSON'ni parse qiladi", () => {
    const out = parseStructured(Schema, '{"javob":"ha","ball":0.9}', ctx);
    expect(out).toEqual({ javob: "ha", ball: 0.9 });
  });

  it("```json o'ramini tozalaydi", () => {
    // Ba'zi modellar so'ralmasa ham JSON'ni kod blokiga o'raydi. Mukammal
    // javobni faqat o'ram sababli rad etib, kreditni qaytarish noto'g'ri.
    const raw = '```json\n{"javob":"ha","ball":0.5}\n```';
    expect(parseStructured(Schema, raw, ctx)).toEqual({ javob: "ha", ball: 0.5 });
  });

  it("tilsiz ``` o'ramini ham tozalaydi", () => {
    expect(parseStructured(Schema, '```\n{"javob":"a","ball":0}\n```', ctx)).toEqual({
      javob: "a",
      ball: 0,
    });
  });

  it("JSON bo'lmagan javob — invalid_output", () => {
    expect(() => parseStructured(Schema, "salom", ctx)).toThrowError(
      expect.objectContaining({ kind: "invalid_output" }),
    );
  });

  it("sxemaga mos kelmagan javob — invalid_output", () => {
    expect(() => parseStructured(Schema, '{"javob":"a"}', ctx)).toThrowError(
      expect.objectContaining({ kind: "invalid_output" }),
    );
  });

  it("xato matnida model qaytargan MAZMUN yo'q", () => {
    // Xato Sentry'ga va foydalanuvchiga ketadi — o'quvchi ma'lumoti yoki
    // uzun matn u yerga tushmasligi kerak.
    const secret = "MAXFIY-MATN-12345";
    try {
      parseStructured(Schema, JSON.stringify({ javob: secret }), ctx);
      throw new Error("xato kutilgandi");
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
      expect((e as Error).message).toContain("ball");
    }
  });

  it("chegara qiymati sxemadan o'tmaydi", () => {
    expect(() => parseStructured(Schema, '{"javob":"a","ball":2}', ctx)).toThrow();
  });
});

describe("embedding yordamchilari", () => {
  it("L2 normallashtirish uzunlikni 1 qiladi", () => {
    const v = l2Normalize([3, 4]);
    expect(Math.hypot(...v)).toBeCloseTo(1, 10);
    expect(v).toEqual([0.6, 0.8]);
  });

  it("nol vektor rad etiladi", () => {
    expect(() => l2Normalize([0, 0, 0])).toThrow(/Nol vektor/);
  });

  it("NaN rad etiladi", () => {
    expect(() => l2Normalize([1, Number.NaN])).toThrow(/NaN/);
    expect(() => l2Normalize([1, Number.POSITIVE_INFINITY])).toThrow(/NaN/);
  });

  it("noto'g'ri o'lcham rad etiladi — sxema vector(768)", () => {
    expect(() => assertDim(new Array(512).fill(0.1))).toThrow(/512.*768/);
    expect(() => assertDim(new Array(768).fill(0.1))).not.toThrow();
  });
});
