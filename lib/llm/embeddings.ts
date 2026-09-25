import { EMBEDDING_MODEL } from "./models";
import { geminiEmbeddings } from "./providers/gemini";
import type { EmbeddingProvider } from "./types";

/**
 * Embedding — mavzularni vektorga aylantirish.
 *
 * Anthropic'da embeddings API yo'q, shuning uchun Gemini ishlatiladi.
 * O'lcham 768 — mavjud `vector(768)` ustunlari va HNSW indekslariga aynan
 * mos (`lib/curriculum/search.ts`). Boshqa o'lcham sxema va indeks
 * migratsiyasini majburlaydi, shuning uchun bu yerda qat'iy tekshiriladi.
 *
 * Bu modul 05-sessiyada to'liq ishlatiladi; hozir qatlam tayyor turadi.
 */

function provider(): EmbeddingProvider {
  return geminiEmbeddings;
}

/**
 * Har vektor L2-normallashtiriladi.
 *
 * NEGA BIZNING KODDA: pgvector indeksi cosine masofasi bilan qurilgan.
 * Normallashtirish provayderlar orasidagi magnitude farqini yo'q qiladi,
 * ya'ni ikkinchi provayderga o'tilganda eski vektorlar bilan
 * solishtirish buzilmaydi.
 */
export function l2Normalize(v: readonly number[]): number[] {
  let sum = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error("Vektorda NaN yoki Infinity");
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new Error("Nol vektor normallashtirib bo'lmaydi");
  return v.map((x) => x / norm);
}

export function assertDim(v: readonly number[], dim = EMBEDDING_MODEL.dim): void {
  if (v.length !== dim) {
    throw new Error(`Vektor o'lchami ${v.length}, kutilgani ${dim}`);
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { vectors } = await provider().embed(texts, "document");
  return vectors.map((v) => {
    assertDim(v);
    return l2Normalize(v);
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  const { vectors } = await provider().embed([text], "query");
  const v = vectors[0];
  if (!v) throw new Error("Embedding qaytmadi");
  assertDim(v);
  return l2Normalize(v);
}
