/**
 * Urug' va seeded tasodifiylik (15-sessiya).
 *
 * BUTUN O'YIN QURILISHI DETERMINISTIK: bitta urug' -> har doim bitta natija.
 * Bu uch narsani beradi:
 *   - test determinizmi (`toEqual` bilan butun panjarani qadash mumkin);
 *   - o'qituvchi hujjatni ikki marta ochganda AYNI o'yinni ko'radi;
 *   - `?variant=N` bir mavzudan bir necha xil varaq beradi, ya'ni yonma-yon
 *     o'tirgan o'quvchilar bir-biridan ko'chira olmaydi.
 *
 * `Math.random` BU PAPKADA UMUMAN ISHLATILMAYDI. Agar ishlatilsa, server va
 * klient turli panjara yasab React hidratsiyasini buzardi, chop etilgan
 * varaq esa ekrandagisidan boshqa chiqardi.
 *
 * `node:crypto` ham ishlatilmaydi: bu modul klient komponentiga ham
 * tushishi mumkin, u yerda esa `node:crypto` yo'q.
 */

/**
 * `documentId` + variant -> 32-bitli urug'.
 *
 * FNV-1a: qisqa, tashqi paketsiz va bir xil kirishga bir xil chiqish
 * beradi (`lib/llm/experiment.ts` dagi sha256 dan farqli — u yerda
 * taqsimotning sifati muhim, bu yerda esa takrorlanuvchanlik).
 *
 * `variant` satrga QO'SHILADI, urug'ga emas: `seed + variant` qo'shni
 * variantlarga qo'shni urug' berardi va `mulberry32` ning birinchi
 * qadamlari o'xshash chiqib, 1 va 2-variant panjaralari bir-biriga
 * o'xshab qolardi.
 */
export function gameSeed(documentId: string, variant: number): number {
  const key = `${documentId}:${String(variant)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // `>>> 0` — ishorasiz 32-bit. Blokdagi `seed` sxemasi `min(0)` talab
  // qiladi, manfiy son esa `contentJson` ga tushib parse'ni yiqitardi.
  return hash >>> 0;
}

/** `[0, 1)` qaytaradigan seeded generator. */
export type Rng = () => number;

/**
 * mulberry32 — 32-bitli holatli, davri 2^32 bo'lgan generator.
 *
 * Kriptografik emas va bo'lishi ham kerak emas: bu yerda maqsad —
 * takrorlanuvchan aralashtirish.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `[0, max)` oralig'idagi butun son. */
export function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

/**
 * Fisher–Yates. YANGI massiv qaytaradi, kirishni o'zgartirmaydi.
 *
 * Joyida aralashtirish `build` ga uzatilgan `content` ni buzardi, u esa
 * `contentJson` dan kelgan obyekt — chaqiruvchi uni keyin boshqa joyda
 * ishlatishi mumkin.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
