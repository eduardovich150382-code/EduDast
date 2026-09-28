import { findSimilarChunks } from "@/lib/curriculum/search";
import { prisma } from "@/lib/db";
import { embedQuery } from "@/lib/llm";

/**
 * Kurikulum konteksti — promptning keshlanadigan qismi.
 *
 * ENG MUHIM TALAB: bir xil kirishda AYNAN bir xil satr. Bu estetik emas,
 * NARX masalasi — Anthropic prompt keshi prefiks bo'yicha ishlaydi, bitta
 * belgi farq qilsa kesh butunlay tushadi va bitta hujjatning uch bosqichi
 * to'liq narxda ketadi.
 *
 * MUAMMO IKKI QAVATLI, ko'pincha faqat birinchisi ko'riladi:
 *   1. TARTIB — teng `similarity` da `ORDER BY embedding <=> vec` barqaror
 *      emas.
 *   2. TO'PLAM (jiddiyroq) — HNSW TAXMINIY indeks. Ikki chaqiruvda qaytgan
 *      bo'laklar bir xil BO'LMASLIGI mumkin, nafaqat tartibi. Buni saralash
 *      bilan tuzatib bo'lmaydi.
 *
 * YECHIM: kontekst hujjat YARATILGANDA bir marta hal qilinadi va tanlangan
 * bo'lak id lari `Document.inputParams.contextChunkIds` ga MUZLATIB
 * qo'yiladi. Bosqichlar vektor qidiruv umuman qilmaydi — id lar bo'yicha
 * oddiy `findMany`. Shunda bitta hujjatning bosqichlari uchun bir xil
 * prefiks KAFOLATLANADI, "ehtimol" emas.
 */

/**
 * Kontekst satrining SHAKLI versiyasi.
 *
 * Satr tuzilishi o'zgarsa OSHIR: kesh kaliti shundan yasaladi, aks holda
 * deploy'dan keyin issiq lambda eski shakldagi satrni qaytarardi.
 */
const CONTEXT_VERSION = 1;

/** Nomzod bo'laklar soni. 8 emas, 12 — chegaradagi tebranishni yutish uchun. */
const CANDIDATE_LIMIT = 12;

/** Promptga tushadigan bo'laklar soni. */
const CONTEXT_LIMIT = 8;

/** Bitta bo'lakdan olinadigan eng ko'p belgi — prompt shishib ketmasin. */
const CHUNK_CHARS = 1_200;

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 50;

/**
 * Matnni deterministik shaklga keltiradi.
 *
 * `NFC` — o'zbek lotinidagi apostrof va diakritik belgilar ikki xil Unicode
 * ko'rinishida kelishi mumkin (`o'` bitta belgi yoki `o` + birlashtiruvchi).
 * Normallashtirilmasa ikki manba ko'zga bir xil, baytda boshqa bo'ladi.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Saralash uchun sof taqqoslash.
 *
 * `localeCompare` ATAYLAB ISHLATILMAYDI: uning natijasi Node'ning ICU
 * varianti va platformaga bog'liq, ya'ni lokal mashina bilan Vercel
 * lambdasi boshqa tartib berib, keshni jimgina o'chirishi mumkin.
 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Qaysi bo'laklar ishlatilishini HAL QILADI. Hujjat yaratilishida BIR MARTA
 * chaqiriladi, keyin hech qachon.
 *
 * `similarity` butun songa yaxlitlanadi: pgvector qaytargan float ikki
 * chaqiruvda oxirgi bitda farq qilishi mumkin va bu saralashni ag'darardi.
 * Teng qiymatlarda id bo'yicha to'liq tartib qo'yiladi.
 */
export async function resolveContextChunks(topicId: string): Promise<string[]> {
  const cached = readCache(topicId);
  if (cached) return cached;

  const pending = computeContextChunks(topicId);
  writeCache(topicId, pending);

  try {
    return await pending;
  } catch (error) {
    // Yiqilgan urinish keshda qolmasin — keyingi so'rov qayta urinsin.
    cache.delete(cacheKey(topicId));
    throw error;
  }
}

async function computeContextChunks(topicId: string): Promise<string[]> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    select: { titleUz: true, objectives: true, keywords: true },
  });
  if (!topic) return [];

  const queryText = normalizeText(
    [topic.titleUz, ...topic.objectives, ...topic.keywords].join(". "),
  );

  const embedding = await embedQuery(queryText, { purpose: "lesson-plan:retrieval" });
  const matches = await findSimilarChunks(embedding, {
    topicId,
    limit: CANDIDATE_LIMIT,
  });

  return matches
    .map((match) => ({ id: match.id, score: Math.round(match.similarity * 1e6) }))
    .sort((a, b) => b.score - a.score || byCodePoint(a.id, b.id))
    .slice(0, CONTEXT_LIMIT)
    .map((match) => match.id)
    .sort(byCodePoint);
}

/**
 * Muzlatilgan id lardan promptga tushadigan satrni quradi.
 *
 * VEKTOR QIDIRUV YO'Q — id lar allaqachon hal qilingan. Shu sababli bu
 * funksiya chaqirilgan har safar bir xil satr qaytaradi.
 *
 * SATRDA BO'LMAYDI: vaqt tamg'asi, `Date`, foydalanuvchi ismi yoki id si,
 * tasodifiy tartib, locale'ga bog'liq formatlash.
 */
export async function buildTopicContext(
  topicId: string,
  chunkIds: string[],
): Promise<string> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      subjectId: true,
      grade: true,
      titleUz: true,
      objectives: true,
      keywords: true,
      hoursPlan: true,
      quarter: true,
    },
  });
  if (!topic) return "";

  const [ancestors, siblings, chunks] = await Promise.all([
    loadAncestors(topic.parentId),
    prisma.topic.findMany({
      where: { parentId: topic.parentId, deletedAt: null, id: { not: topic.id } },
      select: { titleUz: true },
    }),
    chunkIds.length === 0
      ? Promise.resolve([])
      : prisma.sourceChunk.findMany({
          where: { id: { in: chunkIds } },
          select: { id: true, sourceRef: true, content: true },
        }),
  ]);

  const lines: string[] = ["## Kurikulum konteksti", ""];

  if (ancestors.length > 0) {
    lines.push(`Bo'lim: ${ancestors.map((a) => normalizeText(a)).join(" > ")}`);
  }
  lines.push(`Mavzu: ${normalizeText(topic.titleUz)}`);
  lines.push(`Sinf: ${String(topic.grade)}-sinf`);
  if (topic.quarter !== null) lines.push(`Chorak: ${String(topic.quarter)}`);
  if (topic.hoursPlan !== null) {
    lines.push(`Rejadagi soat: ${String(topic.hoursPlan)}`);
  }

  if (topic.objectives.length > 0) {
    lines.push("", "Rasmiy ta'lim maqsadlari:");
    for (const objective of topic.objectives) lines.push(`- ${normalizeText(objective)}`);
  }

  if (topic.keywords.length > 0) {
    // Kalit so'zlar SARALANADI — CSV import tartibi manbaga bog'liq.
    const sorted = [...topic.keywords].map(normalizeText).sort(byCodePoint);
    lines.push("", `Kalit so'zlar: ${sorted.join(", ")}`);
  }

  if (siblings.length > 0) {
    const sorted = siblings.map((s) => normalizeText(s.titleUz)).sort(byCodePoint);
    lines.push("", `Qo'shni mavzular: ${sorted.join("; ")}`);
  }

  if (chunks.length > 0) {
    lines.push("", "## Manba parchalari", "");
    // `findMany` tartibni KAFOLATLAMAYDI — qo'lda saralanadi.
    const sorted = [...chunks].sort((a, b) => byCodePoint(a.id, b.id));
    for (const chunk of sorted) {
      lines.push(`[${normalizeText(chunk.sourceRef)}]`);
      lines.push(normalizeText(chunk.content).slice(0, CHUNK_CHARS));
      lines.push("");
    }
  }

  return normalizeText(lines.join("\n"));
}

/** Ota zanjiri — ildizdan pastga. Sikldan himoyalangan. */
async function loadAncestors(parentId: string | null): Promise<string[]> {
  const titles: string[] = [];
  let current = parentId;

  // Kurikulum daraxti sayoz (fan > bo'lim > mavzu), 10 — buzuq
  // ma'lumotdagi sikl qorovuli, cheklov emas.
  for (let depth = 0; depth < 10 && current !== null; depth++) {
    const parent: { parentId: string | null; titleUz: string } | null =
      await prisma.topic.findFirst({
        where: { id: current, deletedAt: null },
        select: { parentId: true, titleUz: true },
      });
    if (!parent) break;
    titles.unshift(parent.titleUz);
    current = parent.parentId;
  }

  return titles;
}

/* ------------------------------------------------------------------ */
/* Xotira keshi                                                        */
/* ------------------------------------------------------------------ */

/**
 * 10 daqiqalik xotira keshi.
 *
 * ROLI FAQAT XARAJAT: to'g'rilik muzlatilgan id larga tayanadi, keshga emas.
 * Sovuq lambda oddiygina qayta hisoblaydi va AYNI natijani oladi.
 *
 * QIYMAT EMAS, PROMISE keshlanadi: bir lambdaga bir vaqtda ikki so'rov kelsa
 * `embedQuery` ikki marta chaqirilmaydi (stampede).
 *
 * KESHDA FOYDALANUVCHI MA'LUMOTI SAQLANMAYDI — faqat `topicId` -> umumiy
 * kurikulum bo'laklari. Bu shart: bu yerga o'qituvchi parametrlarini qo'shish
 * tabiiy ko'rinadi, lekin u ijarador oralig'ida ma'lumot oqishiga aylanadi.
 */
const cache = new Map<string, { at: number; value: Promise<string[]> }>();

function cacheKey(topicId: string): string {
  return `${String(CONTEXT_VERSION)}:${topicId}`;
}

function readCache(topicId: string): Promise<string[]> | null {
  const entry = cache.get(cacheKey(topicId));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(topicId));
    return null;
  }
  return entry.value;
}

function writeCache(topicId: string, value: Promise<string[]>): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Eng eski yozuvni chiqar — cheksiz `Map` lambda xotirasini sekin bo'g'adi.
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache) {
      if (entry.at < oldestAt) {
        oldestAt = entry.at;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) cache.delete(oldestKey);
  }
  cache.set(cacheKey(topicId), { at: Date.now(), value });
}

/** Testlar uchun — kesh holati testlar orasida oqib ketmasin. */
export function resetContextCache(): void {
  cache.clear();
}
