import type { z } from "zod";
import { creditCost, GAME_LIMITS } from "@/lib/credits/cost-table";
import { buildAnagram } from "./anagram";
import { AnagramContent, WheelContent, WordSearchContent } from "./content";
import { GAME_KINDS, type BuiltGame, type GameContent, type GameKind } from "./types";
import { buildWheel } from "./wheel";
import { buildWordSearch } from "./word-search";

/**
 * O'yin reyestri — `kind` -> sxema, qurilish, chegara, narx (15-sessiya).
 *
 * REACT BU YERDA YO'Q va bu ataylab: reyestr vitest (`environment: "node"`)
 * ichida erkin import qilinishi kerak. Komponentlar alohida reyestrda
 * (`components/games/registry.tsx`), u esa `BuiltGame` union'i ustida
 * `default` tarmog'isiz switch quradi.
 *
 * `limits` VA `cost` IKKALASI HAM `cost-table.ts` GA QARAB TURADI, nusxa
 * emas. Chegarani bu yerda qayta yozish ikkita haqiqat manbai bo'lardi —
 * `kind` ni blokda va `content` da ikki marta saqlash muammosining aynan
 * o'zi, faqat narx tomonida: o'qituvchi ko'rgan narx bilan yechilgan kredit
 * farq qilardi.
 */

export type GameEntry<K extends GameKind> = {
  /** Mazmun sxemasi — `contentJson` dan o'qilganda qo'riqchi. */
  contentSchema: z.ZodType<Extract<GameContent, { kind: K }>>;
  /** `(content, seed) -> tayyor o'yin`. Sof: LLM'siz, bazasiz, `Date` siz. */
  build(content: Extract<GameContent, { kind: K }>, seed: number): BuiltGame;
  /** `GAME_LIMITS[kind]` ning o'zi — qayta yozilmaydi. */
  limits: (typeof GAME_LIMITS)[K];
  /**
   * Chop etiladigan varaq bormi.
   *
   * G'ildirakda `false` — spetsifikatsiya "Varaq yo'q" deydi: aylanadigan
   * g'ildirakni qog'ozga tushirishning ma'nosi yo'q. Bu bayroq UCH joyni
   * boshqaradi (varaq marshruti `notFound`, muharrir kartasidagi havola,
   * hujjat ko'rinishidagi havola), ya'ni bittadan ko'p joyda qaror
   * takrorlanmaydi.
   */
  hasSheet: boolean;
  /** Kredit narxi — `creditCost` ni CHAQIRADI, formulani takrorlamaydi. */
  cost(itemCount: number): number;
};

function entry<K extends GameKind>(
  kind: K,
  config: Pick<GameEntry<K>, "contentSchema" | "build" | "hasSheet">,
): GameEntry<K> {
  return {
    ...config,
    limits: GAME_LIMITS[kind],
    cost: (itemCount) => creditCost({ type: "GAME", gameKind: kind, itemCount }),
  };
}

/**
 * Reyestr. `Record<GameKind, ...>` — yangi `kind` qo'shilib yozuv
 * berilmasa TypeScript shu yerda yiqiladi.
 */
export const GAMES: { [K in GameKind]: GameEntry<K> } = {
  wheel: entry("wheel", {
    contentSchema: WheelContent,
    build: buildWheel,
    hasSheet: false,
  }),
  "word-search": entry("word-search", {
    contentSchema: WordSearchContent,
    build: buildWordSearch,
    hasSheet: true,
  }),
  anagram: entry("anagram", {
    contentSchema: AnagramContent,
    build: buildAnagram,
    hasSheet: true,
  }),
};

/**
 * Mazmunni `kind` iga qarab quradi.
 *
 * `GAMES[content.kind].build(content, seed)` TO'G'RIDAN-TO'G'RI yozilmaydi:
 * TypeScript `GAMES[kind]` ni union sifatida ko'radi va `build` ning
 * parametri union'ning KESISHMASIGA aylanadi (`never`). Switch bilan har
 * tarmoq alohida torlanadi — `default` tarmog'i yo'q, ya'ni yangi tur
 * qo'shilganda shu yerda yiqiladi.
 */
export function buildGame(content: GameContent, seed: number): BuiltGame {
  switch (content.kind) {
    case "wheel":
      return buildWheel(content, seed);
    case "word-search":
      return buildWordSearch(content, seed);
    case "anagram":
      return buildAnagram(content, seed);
  }
}

/** URL taxallusi -> `kind`. Sehrgar va marshrutlar uchun bitta lug'at. */
export const GAME_KIND_PARAM = {
  gildirak: "wheel",
  "soz-qidirish": "word-search",
  anagramma: "anagram",
} as const satisfies Record<string, GameKind>;

export type GameKindParam = keyof typeof GAME_KIND_PARAM;

const PARAM_BY_KIND: Record<GameKind, GameKindParam> = {
  wheel: "gildirak",
  "word-search": "soz-qidirish",
  anagram: "anagramma",
};

/** `"gildirak"` -> `"gildirak"`, boshqasi -> `null`. */
export function readGameKindParam(value: string | null): GameKindParam | null {
  if (value === null) return null;
  // `Object.hasOwn`, `in` EMAS: `in` prototip zanjirini kezadi, ya'ni
  // `?oyin=constructor` kabi qiymat "mavjud" bo'lib chiqardi.
  return Object.hasOwn(GAME_KIND_PARAM, value) ? (value as GameKindParam) : null;
}

export function gameKindFor(param: GameKindParam): GameKind {
  return GAME_KIND_PARAM[param];
}

export function paramForGameKind(kind: GameKind): GameKindParam {
  return PARAM_BY_KIND[kind];
}

/** `GAME_KINDS` tartibida reyestr yozuvlari — forma va testlar uchun. */
export const GAME_LIST = GAME_KINDS.map((kind) => ({ kind, ...GAMES[kind] }));
