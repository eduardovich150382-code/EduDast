import { isLlmError } from "./errors";
import { writeLlmCall, type LlmCallDb } from "./log";
import { EMBEDDING_MODEL } from "./models";
import { geminiEmbeddings } from "./providers/gemini";
import type { EmbeddingProvider, Usage } from "./types";

/**
 * Embedding — mavzularni vektorga aylantirish.
 *
 * Anthropic'da embeddings API yo'q, shuning uchun Gemini ishlatiladi.
 * O'lcham 768 — mavjud `vector(768)` ustunlari va HNSW indekslariga aynan
 * mos (`lib/curriculum/search.ts`). Boshqa o'lcham sxema va indeks
 * migratsiyasini majburlaydi, shuning uchun bu yerda qat'iy tekshiriladi.
 *
 * FAQAT GEMINI (05-sessiya qarori): ikkinchi provayder (`openai`) yangi paket
 * va uchinchi provayder degani, CLAUDE.md esa sababsiz paket qo'shishni
 * taqiqlaydi. `EmbeddingProvider` interfeysi saqlanadi — kerak bo'lganda
 * bitta adapter fayli va `setEmbeddingProvider()` yetarli.
 */

/**
 * Bitta so'rovdagi maksimal matn soni.
 *
 * NEGA PARTIYA: ilgari butun massiv bitta so'rovda ketardi — 500 ta mavzuda
 * bu bitta ulkan chaqiruv, yiqilsa hammasi yo'qoladi va xarajat jurnalida
 * bitta tushunarsiz qator qoladi.
 */
export const EMBED_BATCH = 96;

let override: EmbeddingProvider | null = null;

function provider(): EmbeddingProvider {
  return override ?? geminiEmbeddings;
}

/** Faqat testlar uchun — `lib/llm/providers/registry.ts` dagi naqsh. */
export function setEmbeddingProvider(p: EmbeddingProvider | null): void {
  override = p;
}

export type EmbedOpts = {
  /** `null` — tizim chaqiruvi (backfill, cron). */
  userId?: string | null;
  purpose?: string;
  /** CLI skriptlar uchun — `lib/llm/log.ts` dagi izohga qarang. */
  db?: LlmCallDb;
  /** Har partiyaning usage'i — `pnpm llm:smoke` taxminni solishtirishi uchun. */
  onUsage?: (usage: Usage) => void;
};

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

/**
 * Bitta partiya: chaqiruv + jurnal. Xato bo'lsa ham jurnal yoziladi.
 *
 * `not_configured` da yozilmaydi — tarmoqqa umuman chiqilmagan, ya'ni
 * xarajat ham yo'q. Bu `lib/llm/call.ts` dagi qoidaning aynan o'zi.
 */
async function embedBatch(
  texts: string[],
  kind: "document" | "query",
  opts: EmbedOpts,
): Promise<number[][]> {
  const p = provider();
  const purpose = opts.purpose ?? (kind === "query" ? "embed-query" : "embed-document");
  const userId = opts.userId ?? null;

  try {
    const { vectors, usage } = await p.embed(texts, kind);
    opts.onUsage?.(usage);

    // Jurnal TRANZAKSIYADAN TASHQARIDA yoziladi (chaqiruvchining mas'uliyati):
    // yiqilgan ishning sababi o'sha ish bilan birga rollback bo'lmasin.
    await writeLlmCall(
      { userId, provider: "gemini", model: p.model, usage, purpose },
      opts.db,
    );

    return vectors.map((v) => {
      assertDim(v);
      return l2Normalize(v);
    });
  } catch (e) {
    if (isLlmError(e) && e.kind === "not_configured") throw e;

    await writeLlmCall(
      {
        userId,
        provider: "gemini",
        model: p.model,
        // Token noma'lum — nol bilan yoziladi (LlmCall.errorKind izohi).
        usage: { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 },
        purpose,
        errorKind: isLlmError(e) ? e.kind : "unknown",
      },
      opts.db,
    );
    throw e;
  }
}

/**
 * Matnlarni vektorga aylantiradi. Tartib KIRUVCHI tartibda qaytadi.
 *
 * Partiyalar KETMA-KET yuboriladi — parallel emas. Sabab: rate limit va
 * byudjet jurnalida chaqiruvlar tartibi ko'rinib turishi kerak.
 *
 * YARIM NATIJA QAYTARMAYDI: o'rtadagi partiya yiqilsa xato tashlanadi va
 * oldingi vektorlar tashlab ketiladi. Yarim massiv qaytarish chaqiruvchining
 * indekslarini siljitadi — mavzuga BOSHQA mavzuning vektori yozilardi, va
 * bu jimgina, sog'lom ko'rinib turadigan nosozlik.
 *
 * TARMOQ CHAQIRUVI: `$transaction` ichida chaqirilmasin (Prisma interaktiv
 * tranzaksiyasi sukut bo'yicha 5 s da uziladi — P2028).
 */
export async function embedTexts(texts: string[], opts: EmbedOpts = {}): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH), "document", opts)));
  }
  return out;
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<number[]> {
  const vectors = await embedBatch([text], "query", opts);
  const v = vectors[0];
  if (!v) throw new Error("Embedding qaytmadi");
  return v;
}
