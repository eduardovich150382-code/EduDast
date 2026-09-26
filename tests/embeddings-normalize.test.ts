import { describe, expect, it } from "vitest";
import { assertDim, l2Normalize } from "@/lib/llm/embeddings";
import { EMBEDDING_MODEL } from "@/lib/llm/models";
import { EMBEDDING_DIM } from "@/lib/curriculum/search";

/**
 * L2 normallashtirish va o'lcham tekshiruvi.
 *
 * NEGA MUHIM: pgvector indeksi cosine masofasi bilan qurilgan. Normallashmagan
 * vektor xato bermaydi — shunchaki o'xshashlik hisobini buzadi, ya'ni qidiruv
 * jimgina yomon javob qaytaradi.
 */

/** 768 uzunlikdagi vektor — barcha qiymatlar bir xil. */
function flat(value: number, dim = EMBEDDING_DIM): number[] {
  return Array.from({ length: dim }, () => value);
}

describe("o'lcham bitta manbadan", () => {
  /**
   * Ikki konstanta bir xilligi SHART: `EMBEDDING_DIM` — SQL tomoni
   * (`vector(768)` va HNSW indeksi), `EMBEDDING_MODEL.dim` — chaqiruv
   * tomoni. Ular ajralib ketsa yozish 768 dan boshqa uzunlikda vektor
   * yasab, Postgres tushunarsiz "expected 768 dimensions" xatosini beradi.
   *
   * NEGA IMPORT BILAN BIRLASHTIRILMAGAN: `lib/llm` → `lib/curriculum`
   * bog'liqligi yo'nalishi teskari bo'lardi (LLM qatlami kurikulumga
   * bog'lanib qolardi). Shuning uchun tenglik test bilan qadalgan.
   */
  it("EMBEDDING_DIM === EMBEDDING_MODEL.dim", () => {
    expect(EMBEDDING_DIM).toBe(EMBEDDING_MODEL.dim);
    expect(EMBEDDING_DIM).toBe(768);
  });
});

describe("l2Normalize", () => {
  it("uzunligi 1 ga keladi", () => {
    const out = l2Normalize([3, 4]);

    expect(Math.hypot(...out)).toBeCloseTo(1, 12);
    expect(out).toEqual([0.6, 0.8]);
  });

  it("yo'nalishni saqlaydi (nisbatlar o'zgarmaydi)", () => {
    const out = l2Normalize([1, 2, 3]);

    expect(out[1]! / out[0]!).toBeCloseTo(2, 12);
    expect(out[2]! / out[0]!).toBeCloseTo(3, 12);
  });

  it("allaqachon normallashgan vektorni o'zgartirmaydi", () => {
    const out = l2Normalize([0, 1, 0]);

    expect(out).toEqual([0, 1, 0]);
  });

  it("juda kichik qiymatlarda ham uzunlik 1", () => {
    const out = l2Normalize(flat(1e-8));

    expect(Math.hypot(...out)).toBeCloseTo(1, 10);
  });

  it.each([
    ["NaN", [1, Number.NaN, 3]],
    ["Infinity", [1, Number.POSITIVE_INFINITY]],
    ["-Infinity", [Number.NEGATIVE_INFINITY, 1]],
  ])("rad etadi: %s", (_nom, input) => {
    expect(() => l2Normalize(input)).toThrow(/NaN yoki Infinity/);
  });

  it("nol vektorni rad etadi (0 ga bo'lish jimgina NaN berardi)", () => {
    expect(() => l2Normalize(flat(0))).toThrow(/Nol vektor/);
  });
});

describe("assertDim", () => {
  it("768 ni qabul qiladi", () => {
    expect(() => assertDim(flat(1))).not.toThrow();
  });

  it.each([767, 769, 0, 1, 1536])("rad etadi: %i", (dim) => {
    expect(() => assertDim(flat(1, dim))).toThrow(/Vektor o'lchami/);
  });

  it("xato xabarida ikkala son ko'rinadi", () => {
    expect(() => assertDim(flat(1, 1536))).toThrow("Vektor o'lchami 1536, kutilgani 768");
  });
});
