import { FILLER_ALPHABET } from "./alphabet";
import { GRID_SIZE } from "./grid";
import { mulberry32, randomInt, shuffle, type Rng } from "./seed";
import type { BuiltWordSearch, Direction, PlacedWord, WordSearchContent } from "./types";

/**
 * So'z qidirish panjarasi — sof algoritm (15-sessiya, 2-qatlam).
 *
 * AI'DAN PANJARA SO'RALMAYDI. Model kesishgan harflarni deyarli hech qachon
 * to'g'ri qilmaydi va natijani tekshirib ham bo'lmaydi: "bu panjarada
 * CHIZIQ bor" degan javobni tasdiqlash uchun baribir shu yerdagi qidiruv
 * algoritmi kerak bo'lardi. Model faqat so'z ro'yxatini beradi.
 */

export { GRID_SIZE };

/**
 * Butun panjarani qayta qurish urinishlari soni.
 *
 * NEGA SO'Z TASHLANMAYDI, PANJARA QAYTA QURILADI: bitta so'zni tashlab
 * yuborish uchta joyda qarama-qarshilik yasardi — o'qituvchi 14 so'z uchun
 * TO'LAYDI (`cost-table.ts` narxni `itemCount` bo'yicha oladi), sifat
 * bahosi element sonini so'ralganiga tenglashtiradi, varaqdagi ro'yxat esa
 * qisqa chiqardi.
 *
 * Bitta so'z uchun joy izlash TO'LIQ (`place` izohiga qarang), ya'ni
 * yiqilish faqat OLDIN qo'yilgan so'zlar keyingisiga joy qoldirmaganda
 * yuzaga keladi. Qayta qurish so'z TARTIBINI o'zgartiradi va shu holatdan
 * chiqaradi. Jami harf shifti (`MAX_TOTAL_LETTERS`) bilan birga bu
 * `unplaced` ni o'lchovda NOLGA tushiradi.
 */
const MAX_GRID_ATTEMPTS = 4;

/** Sakkiz yo'nalish: gorizontal, vertikal va ikki diagonal, ikki tomonga. */
export const DIRECTIONS: readonly Direction[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
];

type Cell = string | null;
type Grid = Cell[][];

function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

/**
 * So'zni berilgan joy va yo'nalishga qo'yib ko'radi.
 *
 * Qaytadi: mos kelgan (kesishgan) harflar soni, yoki mos kelmasa `-1`.
 * Katak BO'SH yoki AYNI HARF bo'lsa mos keladi — kesishish aynan shunday
 * yuzaga keladi.
 *
 * `-1` ishlatiladi, `null` emas: `0` ham haqiqiy javob (kesishishsiz joy).
 */
function crossings(grid: Grid, word: string, row: number, col: number, dir: Direction): number {
  let shared = 0;
  for (let i = 0; i < word.length; i += 1) {
    const r = row + dir.dy * i;
    const c = col + dir.dx * i;
    if (!inBounds(r, c)) return -1;
    const cell = grid[r]![c];
    if (cell === null) continue;
    if (cell !== word[i]) return -1;
    shared += 1;
  }
  return shared;
}

function write(grid: Grid, word: string, row: number, col: number, dir: Direction): void {
  for (let i = 0; i < word.length; i += 1) {
    grid[row + dir.dy * i]![col + dir.dx * i] = word[i]!;
  }
}

/**
 * Bitta so'z uchun joy izlaydi. Joy BO'LSA — har doim topadi.
 *
 * ILGARI TASODIFIY NUQTA TASHLANARDI (240 urinish: tasodifiy yo'nalish +
 * tasodifiy boshlanish). O'lchov shuni ko'rsatdi: 12x12 panjaraga 90 harf
 * qo'yilganda shu usul 0.75-2.5% urug'da so'zni joylashtira olmasdi — joy
 * BOR edi, lekin dart tasodifan unga tushmasdi.
 *
 * To'liq sanash (12 x 12 x 8 = 1152 nomzod, har biri <= 10 qadam) "joy
 * bo'lsa — topiladi" kafolatini beradi. Narxi arzon: eng og'ir yuklamada
 * bitta qurish ~1.6 ms, 200 ms byudjetiga yaqin ham kelmaydi.
 *
 * NOMZODLAR KESISHISHGA QARAB SARALANADI: ko'p harfi mos keladigan joy
 * oldin olinadi. Kesishish panjarani zichlashtiradi (bir katak ikki so'zga
 * ishlaydi), keyingi so'zlarga joy qoldiradi va o'yinni qiziqroq qiladi.
 * Avval aralashtiriladi, keyin saralanadi — `sort` turg'un (ES2019), ya'ni
 * teng kesishishli joylar ichida tasodifiylik saqlanadi.
 */
function place(grid: Grid, rng: Rng, word: string): PlacedWord | null {
  const candidates: { row: number; col: number; dir: Direction; shared: number }[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      for (const dir of DIRECTIONS) {
        const shared = crossings(grid, word, row, col, dir);
        if (shared >= 0) candidates.push({ row, col, dir, shared });
      }
    }
  }

  if (candidates.length === 0) return null;

  const ordered = shuffle(rng, candidates).sort((a, b) => b.shared - a.shared);
  const best = ordered[0]!;
  write(grid, word, best.row, best.col, best.dir);
  return { word, row: best.row, col: best.col, direction: best.dir };
}

/**
 * So'z tartibi: UZUNDAN QISQAGA, teng uzunliklar ichida aralashgan.
 *
 * Uzun so'z birinchi qo'yiladi, chunki panjara bo'sh bo'lganda uning joyi
 * ko'p; qisqa so'zlar esa keyin bo'sh joyga sig'adi. Teng uzunliklarni
 * aralashtirish har urinishda (va har urug'da) boshqa panjara beradi.
 *
 * `Array.prototype.sort` turg'un (ES2019), ya'ni aralashtirish natijasi
 * teng uzunliklar ichida saqlanadi.
 */
function orderWords(rng: Rng, words: readonly string[]): string[] {
  return shuffle(rng, words).sort((a, b) => b.length - a.length);
}

/**
 * Urinish raqamidan mustaqil urug' yasaydi.
 *
 * `seed + attempt` ishlatilmaydi: qo'shni urug'lar `mulberry32` ning
 * birinchi qadamlarini o'xshash qilib, qayta qurish AYNI muammoga qaytib
 * kelishi mumkin edi. Oltin nisbat ko'paytmasi bitlarni tarqatadi.
 */
function attemptSeed(seed: number, attempt: number): number {
  return (seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
}

/** Bo'sh kataklarni to'ldiradi — natijada bo'sh katak QOLMAYDI. */
function fill(grid: Grid, rng: Rng): string[][] {
  return grid.map((row) =>
    row.map((cell) => cell ?? FILLER_ALPHABET[randomInt(rng, FILLER_ALPHABET.length)]!),
  );
}

export function buildWordSearch(content: WordSearchContent, seed: number): BuiltWordSearch {
  let best: { grid: Grid; placed: PlacedWord[]; unplaced: string[]; rng: Rng } | null = null;

  for (let attempt = 0; attempt < MAX_GRID_ATTEMPTS; attempt += 1) {
    const rng = mulberry32(attemptSeed(seed, attempt));
    const grid = emptyGrid();
    const placed: PlacedWord[] = [];
    const unplaced: string[] = [];

    for (const word of orderWords(rng, content.words)) {
      const result = place(grid, rng, word);
      if (result === null) unplaced.push(word);
      else placed.push(result);
    }

    // To'liq joylashdi — qolgan urinishlar kerak emas.
    if (unplaced.length === 0) {
      return {
        kind: "word-search",
        size: GRID_SIZE,
        grid: fill(grid, rng),
        placed: sortPlaced(placed, content.words),
        unplaced: [],
      };
    }

    if (best === null || unplaced.length < best.unplaced.length) {
      best = { grid, placed, unplaced, rng };
    }
  }

  // Hamma urinish barbod bo'ldi — ENG YAXSHISI qaytariladi va `unplaced`
  // to'ldiriladi. Bu tarmoq amalda yuzaga chiqmaydi (yuqoridagi izoh), lekin
  // jim yutilmaydi: `lib/generation/quality.ts` uni ko'rib ball tushiradi.
  const fallback = best!;
  return {
    kind: "word-search",
    size: GRID_SIZE,
    grid: fill(fallback.grid, fallback.rng),
    placed: sortPlaced(fallback.placed, content.words),
    unplaced: fallback.unplaced,
  };
}

/**
 * Joylashgan so'zlarni MAZMUNDAGI tartibga qaytaradi.
 *
 * `orderWords` ularni uzunlik bo'yicha aralashtirgan, lekin varaqdagi
 * ro'yxat va doskadagi "topilgan" belgisi mazmun tartibida bo'lishi kerak:
 * aks holda bitta hujjatning ikki render'ida ro'yxat tartibi o'zgarib
 * ko'rinardi (urug' bir xil bo'lsa ham, mazmun tahrirlansa).
 */
function sortPlaced(placed: readonly PlacedWord[], words: readonly string[]): PlacedWord[] {
  const order = new Map(words.map((word, index) => [word, index]));
  return [...placed].sort((a, b) => (order.get(a.word) ?? 0) - (order.get(b.word) ?? 0));
}

/* ------------------------------------------------------------------ */
/* Doska mexanikasi — sof funksiyalar                                  */
/* ------------------------------------------------------------------ */

export type Point = { row: number; col: number };

/**
 * Ikki katak orasidagi to'g'ri chiziq. Chiziq bo'lmasa `null`.
 *
 * Doska mexanikasi: bola so'zning BIRINCHI va OXIRGI harfini ketma-ket
 * bosadi (spetsifikatsiyadagi mexanika — smart doskada barmoq bilan
 * ishlaydi). Shu funksiya ikki bosish orasidagi kataklarni beradi.
 *
 * NEGA KOMPONENTDA EMAS: bu loyihada React test muhiti yo'q (vitest `node`,
 * jsdom ham, RTL ham yo'q), ya'ni komponent ichidagi mantiq umuman
 * testlanmaydi (`lib/slides/deck.ts:4-12` dagi ayni qaror).
 */
export function segmentBetween(from: Point, to: Point): Point[] | null {
  const dRow = to.row - from.row;
  const dCol = to.col - from.col;

  // Bir xil katak — chiziq emas: bir harfli so'z yo'q (`MIN_WORD_LENGTH`).
  if (dRow === 0 && dCol === 0) return null;

  // Sakkiz yo'nalishdan birida bo'lishi kerak: gorizontal, vertikal yoki
  // AYNAN 45 gradus. Aks holda bu "chiziq" emas, ikki tasodifiy katak.
  if (dRow !== 0 && dCol !== 0 && Math.abs(dRow) !== Math.abs(dCol)) return null;

  const length = Math.max(Math.abs(dRow), Math.abs(dCol)) + 1;
  const stepRow = Math.sign(dRow);
  const stepCol = Math.sign(dCol);

  const points: Point[] = [];
  for (let i = 0; i < length; i += 1) {
    const row = from.row + stepRow * i;
    const col = from.col + stepCol * i;
    if (!inBounds(row, col)) return null;
    points.push({ row, col });
  }
  return points;
}

/** Kataklar ketma-ketligidan satr yasaydi. */
export function lettersAt(grid: readonly (readonly string[])[], points: readonly Point[]): string {
  return points.map((point) => grid[point.row]?.[point.col] ?? "").join("");
}

/**
 * Bosilgan ikki katak qaysi so'zni beradi — yo'q bo'lsa `null`.
 *
 * TESKARI YO'NALISH HAM QABUL QILINADI: so'z panjaraga bir yo'nalishda
 * yozilgan, lekin bola uni oxiridan boshiga qarab ko'rishi mumkin va bu
 * ham TO'G'RI topish. Tekshirish `remaining` ro'yxati bo'yicha, butun
 * lug'at bo'yicha emas — topilgan so'zni qayta bosish ballni oshirmaydi.
 */
export function matchWord(
  grid: readonly (readonly string[])[],
  remaining: readonly string[],
  from: Point,
  to: Point,
): { word: string; points: Point[] } | null {
  const points = segmentBetween(from, to);
  if (points === null) return null;

  const forward = lettersAt(grid, points);
  const backward = [...forward].reverse().join("");

  for (const word of remaining) {
    if (word === forward) return { word, points };
    if (word === backward) return { word, points: [...points].reverse() };
  }
  return null;
}

/**
 * So'zni panjarada MUSTAQIL qidiradi — `placed` yozuviga qaramaydi.
 *
 * Test uchun: `buildWordSearch` ning o'z hisobotiga ishonib "so'z joylashdi"
 * deb qabul qilish algoritmning o'zini tekshirmasdi. Shu funksiya panjarani
 * sakkiz yo'nalish bo'ylab skanerlaydi, ya'ni mustaqil tasdiq beradi.
 */
export function findWord(grid: readonly (readonly string[])[], word: string): Point | null {
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < (grid[row]?.length ?? 0); col += 1) {
      for (const dir of DIRECTIONS) {
        let found = true;
        for (let i = 0; i < word.length; i += 1) {
          const r = row + dir.dy * i;
          const c = col + dir.dx * i;
          if (grid[r]?.[c] !== word[i]) {
            found = false;
            break;
          }
        }
        if (found) return { row, col };
      }
    }
  }
  return null;
}
