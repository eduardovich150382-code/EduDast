import type { AnagramContent, GameContent, WheelContent, WordSearchContent } from "./content";

/**
 * O'yin turlari va qurilgan o'yin shakllari (15-sessiya).
 *
 * UCH QATLAMLI ARXITEKTURA:
 *   1. MAZMUN (`content.ts`) — AI yozadi, `contentJson` da saqlanadi;
 *   2. QURISH (`wheel.ts` / `word-search.ts` / `anagram.ts`) — sof algoritm,
 *      `(content, seed) -> BuiltGame`, LLM'siz, bazasiz;
 *   3. KO'RSATISH (`components/games/**`) — doska va varaq.
 *
 * `BuiltGame` HECH QAYERDA SAQLANMAYDI: u har render'da `seed` dan qayta
 * hisoblanadi. Shu sababli `?variant=N` bir xil mazmundan boshqa panjara
 * yasay oladi va bazaga yangi ustun kerak bo'lmaydi.
 */

export const GAME_KINDS = ["wheel", "word-search", "anagram"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export type { AnagramContent, GameContent, WheelContent, WordSearchContent };

/* ------------------------------------------------------------------ */
/* Qurilgan o'yin                                                      */
/* ------------------------------------------------------------------ */

export type BuiltWheelSector = {
  category: string;
  question: string;
  answer: string;
};

export type BuiltWheel = {
  kind: "wheel";
  /** Sektorlar — urug' bo'yicha aralashgan tartibda. */
  sectors: BuiltWheelSector[];
};

/** Panjaradagi yo'nalish: 8 tomon, har biri bitta qadamlik vektor. */
export type Direction = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export type PlacedWord = {
  word: string;
  /** Birinchi harf koordinatasi. */
  row: number;
  col: number;
  direction: Direction;
};

export type BuiltWordSearch = {
  kind: "word-search";
  size: number;
  /** `size` qatorli, har qatorda `size` harf. Bo'sh katak YO'Q. */
  grid: string[][];
  placed: PlacedWord[];
  /**
   * Joylashtirib bo'lmagan so'zlar — amalda HAR DOIM bo'sh.
   *
   * Maydon ataylab OCHIQ turadi: `buildWordSearch` panjarani bir necha
   * marta qaytadan quradi va to'liq joylashishga erishadi, lekin agar
   * kelajakda panjara kichraysa yoki so'z uzaysa, bu holat JIM
   * YUTILMASLIGI kerak. `lib/generation/quality.ts` shu maydonni ko'rib
   * ball tushiradi.
   */
  unplaced: string[];
};

export type BuiltAnagramItem = {
  /** Asl so'z — javoblar kaliti va tekshirish uchun. */
  word: string;
  clue: string;
  /** Aralashgan harflar. `word` ga TENG EMAS. */
  scrambled: string[];
};

export type BuiltAnagram = {
  kind: "anagram";
  items: BuiltAnagramItem[];
};

/**
 * Qurilgan o'yin — `kind` bo'yicha diskriminatsiyalangan.
 *
 * Komponent reyestri (`components/games/registry.tsx`) shu union ustida
 * `default` TARMOG'ISIZ switch quradi, ya'ni to'rtinchi o'yin qo'shilganda
 * TypeScript aynan o'sha yerda yiqiladi.
 */
export type BuiltGame = BuiltWheel | BuiltWordSearch | BuiltAnagram;

/** `BuiltGame` ni `kind` bo'yicha torlash uchun yordamchi. */
export type BuiltFor<K extends GameKind> = Extract<BuiltGame, { kind: K }>;
export type ContentFor<K extends GameKind> = Extract<GameContent, { kind: K }>;
