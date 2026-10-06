import { z } from "zod";
import { blockId, type Block } from "@/lib/documents/blocks";
import { normalizeWord } from "@/lib/games/alphabet";
import { MAX_TOTAL_LETTERS } from "@/lib/games/grid";
import { GAME_LIMITS } from "@/lib/credits/cost-table";
import type { GameContent, GameKind } from "@/lib/games/types";
import type { GenerationPlan, SkeletonGate, StageSpec } from "./plans";

/**
 * `GAME` konveyerining bosqich rejasi (15-sessiya).
 *
 * `plans-slides.ts` ning naqshi: butun o'ziga xoslik shu faylda, konveyer
 * (kursor, ijara, `commitStage`, kredit) o'zgarishsiz qoladi.
 *
 * TAQDIMOTDAN IKKI FARQI:
 *
 * 1. BITTA BOSQICH. Taqdimotda struktura + ikki yarim kerak edi, chunki
 *    8-20 slaydning sarlavha + punkt + izohi bitta javobga sig'masdi.
 *    O'yin mazmuni esa kichik: eng kattasi 14 ta so'z yoki 8 ta
 *    savol-javob. Bo'linish Vercel'ning 60 soniyalik shiftiga yaqin ham
 *    kelmaydi va `BASE.GAME = 1` ayni shuni aks ettiradi.
 *
 * 2. `cheap` DARAJA. Spetsifikatsiya shunday belgilagan va mazmun turi ham
 *    shunga mos: so'z–ta'rif juftligi uchun `mid` daraja ortiqcha xarajat.
 *    Daraja `run-stage.ts` dagi `TIER` jadvalida.
 */

/** Reja — bitta `content` bosqichi. */
export function buildGamePlan(): GenerationPlan {
  return { stages: [{ id: "1", kind: "content" }] };
}

/* ------------------------------------------------------------------ */
/* Bosqich chiqish sxemalari                                           */
/* ------------------------------------------------------------------ */

/**
 * DIQQAT — `plans.ts:93-99` dagi ogohlantirish bu yerga ham to'liq tegishli:
 * sxemalar TEKIS, `id` maydoni yo'q, union yo'q, IXTIYORIY MAYDON YO'Q.
 *
 * SO'Z MAYDONI `z.string()`, `GridWord` EMAS. Modeldan normallashgan so'z
 * talab qilish (apostrofsiz, katta harfda) javobni yaroqsiz qilib
 * yiqitardi: model tabiiy ravishda "o'quvchi" deb yozadi. Normalizatsiya
 * `gameBlocks` da bo'ladi, ya'ni model o'z tilida yozadi, sxema esa
 * `contentJson` ga tushishdan oldin tozalanган so'zni ko'radi.
 */

export const WheelOut = z.strictObject({
  title: z.string().min(3).max(200),
  sectors: z
    .array(
      z.strictObject({
        category: z.string().min(1).max(40),
        question: z.string().min(5).max(300),
        answer: z.string().min(1).max(300),
      }),
    )
    .min(4)
    .max(GAME_LIMITS.wheel.max),
});
export type WheelOut = z.infer<typeof WheelOut>;

export const WordSearchOut = z.strictObject({
  title: z.string().min(3).max(200),
  words: z.array(z.string().min(1).max(40)).min(4).max(GAME_LIMITS["word-search"].max * 2),
});
export type WordSearchOut = z.infer<typeof WordSearchOut>;

export const AnagramOut = z.strictObject({
  title: z.string().min(3).max(200),
  items: z
    .array(
      z.strictObject({
        word: z.string().min(1).max(40),
        clue: z.string().min(5).max(300),
      }),
    )
    .min(4)
    .max(GAME_LIMITS.anagram.max * 2),
});
export type AnagramOut = z.infer<typeof AnagramOut>;

/**
 * `kind` va MODEL JAVOBI birga — diskriminatsiyalangan.
 *
 * NEGA SHU SHAKL: `gameContentFrom(kind, out)` ikki alohida parametr bilan
 * `out` ni `as WheelOut` qilib kastlashga majbur qilardi, ya'ni `kind` va
 * `out` nomuvofiq kelgan holat tur tizimidan jimgina o'tib ketardi.
 * Bu union'da u kompilyatsiya xatosi.
 *
 * MODELGA union KETMAYDI — `run-stage.ts` tor sxema bilan parse qilib,
 * natijani shu shaklga o'raydi (`lib/documents/blocks.ts:6-23` dagi
 * sabab: `$ref`/`oneOf` Gemini zanjirida `invalid_output` ga aylanadi).
 */
export type GameOut =
  | { kind: "wheel"; out: WheelOut }
  | { kind: "word-search"; out: WordSearchOut }
  | { kind: "anagram"; out: AnagramOut };

/**
 * `kind` -> SXEMA yordamchisi ATAYLAB YO'Q.
 *
 * `gameOutSchema(kind)` yozilgan edi, lekin u union qaytaradi va
 * `runLlm({ schema })` ning generigini union'ning BIRINCHI a'zosiga
 * bog'lab qo'yadi — natija noto'g'ri turda chiqadi va `as` kasti bilan
 * yopishga majbur qiladi. Shuning uchun `run-stage.ts` `kind` bo'yicha
 * tarmoqlanib har tarmoqda KONKRET sxemani uzatadi.
 */

/** Har chiqishda sarlavha bor — union ustida umumiy o'qish uchun. */
export function gameTitle(out: GameOut): string {
  return out.out.title;
}

/* ------------------------------------------------------------------ */
/* Bloklarga o'girish                                                  */
/* ------------------------------------------------------------------ */

/**
 * `itemCount` dan oshgan element TASHLANADI, yetmagani esa darvozada
 * ushlanadi (`checkGameContent`).
 *
 * Ortig'ini tashlash `slideBlocks` dagi ayni qaror: so'ralgan son —
 * haqiqat manbai, model esa ba'zan bir-ikkita ko'p beradi.
 */
function take<T>(items: readonly T[], count: number): T[] {
  return items.slice(0, count);
}

/**
 * Modelning tekis javobini `game` blokiga o'giradi.
 *
 * NORMALIZATSIYA SHU YERDA: model "o'quvchi" deb yozadi, panjara esa
 * `OQUVCHI` ni kutadi. Yaroqsiz so'z (`w` li, raqamli, ikki so'zli)
 * TASHLANADI — natijada son kamayishi mumkin, shuning uchun
 * `checkGameContent` normalizatsiyadan KEYIN sanaydi va kam bo'lsa
 * bosqichni yiqitadi. Ya'ni o'qituvchi to'lagan son bilan olgan soni
 * har doim mos keladi.
 */
export function gameContentFrom(result: GameOut, itemCount: number): GameContent {
  switch (result.kind) {
    case "wheel":
      return { kind: "wheel", sectors: take(result.out.sectors, itemCount) };

    case "word-search": {
      const words = normalizedWords(result.out.words);
      return { kind: "word-search", words: take(fitLetters(words, itemCount), itemCount) };
    }

    case "anagram": {
      const items: { word: string; clue: string }[] = [];
      const seen = new Set<string>();
      for (const item of result.out.items) {
        const word = normalizeWord(item.word);
        if (word === null || seen.has(word)) continue;
        seen.add(word);
        items.push({ word, clue: item.clue });
      }
      return { kind: "anagram", items: take(items, itemCount) };
    }
  }
}

/** Normallashgan, takrorlanmas so'zlar — kelgan tartibda. */
function normalizedWords(raw: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const word = normalizeWord(value);
    if (word === null || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

/**
 * Jami harf shiftiga sig'adigan to'plamni tanlaydi.
 *
 * Model shiftni promptda ko'radi (`gameTail`), lekin uni buzishi mumkin.
 * Shunda eng UZUN so'zlarni tashlab yuborish shiftga sig'dirishning eng
 * arzon yo'li: qisqa so'zlar panjarada chiroyliroq kesishadi ham.
 *
 * Agar shu bilan ham son yetmasa `checkGameContent` bosqichni yiqitadi —
 * ya'ni sig'maydigan mazmun jimgina qisqartirilib o'qituvchiga
 * berilmaydi.
 */
function fitLetters(words: readonly string[], itemCount: number): string[] {
  const byLength = [...words].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  let total = 0;
  for (const word of byLength) {
    if (kept.length >= itemCount) break;
    if (total + word.length > MAX_TOTAL_LETTERS) continue;
    kept.push(word);
    total += word.length;
  }
  // Mazmundagi tartibni qaytaramiz: varaqdagi ro'yxat model bergan
  // tartibda bo'lsin, uzunlik bo'yicha saralangan holda emas.
  const keptSet = new Set(kept);
  return words.filter((word) => keptSet.has(word));
}

/** Sarlavha + o'yin bloki. */
export function gameBlocks(
  spec: StageSpec,
  input: { result: GameOut; itemCount: number; seed: number },
): Block[] {
  return [
    {
      id: blockId(spec.id, "heading", 0),
      type: "heading",
      level: 1,
      text: gameTitle(input.result),
    },
    {
      id: blockId(spec.id, "game", 0),
      type: "game",
      seed: input.seed,
      content: gameContentFrom(input.result, input.itemCount),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Bosqich ko'rsatmalari (kesh chegarasidan KEYIN)                     */
/* ------------------------------------------------------------------ */

export function gameStageInstruction(input: { kind: GameKind; itemCount: number }): string {
  const count = String(input.itemCount);

  switch (input.kind) {
    case "wheel":
      return [
        "Omad g'ildiragi uchun mazmun tuz.",
        "",
        "Kerak:",
        "- o'yinning sarlavhasi;",
        `- aynan ${count} ta sektor, har birida kategoriya, savol va javob.`,
        "",
        "Kategoriyalar takrorlanmasin.",
        "Savol og'zaki javob beriladigan bo'lsin, javob to'liq va aniq.",
      ].join("\n");

    case "word-search":
      return [
        "So'z qidirish o'yini uchun so'zlar ro'yxatini tuz.",
        "",
        "Kerak:",
        "- o'yinning sarlavhasi;",
        `- aynan ${count} ta so'z.`,
        "",
        "Har so'z BITTA so'z bo'lsin: ibora, chiziqcha, raqam va qisqartma yo'q.",
        "ch va sh digraflari, o' va g' harflari mumkin.",
        "PANJARANI TUZMA — faqat so'zlar ro'yxatini ber.",
      ].join("\n");

    case "anagram":
      return [
        "Anagramma o'yini uchun so'z va ta'riflar tuz.",
        "",
        "Kerak:",
        "- o'yinning sarlavhasi;",
        `- aynan ${count} ta element, har birida so'z va uning ta'rifi.`,
        "",
        "Ta'rif so'zning o'zini ichiga olmasin — u javobni oshkor qiladi.",
        "Ta'rif bir to'liq jumla bo'lsin.",
        "HARFLARNI ARALASHTIRMA — faqat asl so'zni ber.",
      ].join("\n");
  }
}

/* ------------------------------------------------------------------ */
/* Arzon strukturaviy darvoza                                          */
/* ------------------------------------------------------------------ */

/**
 * Bosqichdan keyingi darvoza — BLOK SXEMASIDAN OLDIN.
 *
 * NORMALIZATSIYADAN KEYIN sanaydi, model javobidagi xom sonni emas. Bu
 * farq muhim: model 14 ta so'z berib, uchtasi `w` li yoki ikki so'zli
 * bo'lsa, xom son 14 bo'lardi, panjaraga esa 11 ta so'z tushardi. Shunda
 * o'qituvchi 14 ta uchun to'lab 11 ta olardi va `quality.ts` dagi element
 * soni qoidasi hujjatni baribir yiqitardi — lekin kreditni ALLAQACHON
 * yechilgandan keyin. Bu yerda yiqitish kreditni qaytaradi.
 */
export function checkGameContent(result: GameOut, itemCount: number): SkeletonGate {
  const got = countItems(gameContentFrom(result, itemCount));
  if (got >= itemCount) return { ok: true };

  /*
   * SABABNI AJRATAMIZ: so'z YAROQSIZ bo'lgani uchunmi, yoki yaroqli,
   * lekin PANJARAGA SIG'MAGANI uchunmi.
   *
   * Ilgari ikkisi ham "N ta yaroqli element qaytdi" deb chiqardi va bu
   * chalg'itardi: model 14 ta mukammal o'zbek so'zini qaytargan, hammasi
   * normalizatsiyadan o'tgan, lekin jami 133 harf bo'lgani uchun uchtasi
   * tashlangan holat "yaroqsiz so'z" bo'lib ko'rinardi. Sabab
   * `Document.failReason` ga tushadi va o'qituvchi uni ekranda ko'radi,
   * shuning uchun u to'g'ri bo'lishi kerak.
   */
  if (result.kind === "word-search") {
    const valid = normalizedWords(result.out.words);
    const letters = valid.reduce((sum, word) => sum + word.length, 0);
    if (valid.length >= itemCount && letters > MAX_TOTAL_LETTERS) {
      return {
        ok: false,
        reason: `o'yin: so'zlar panjaraga sig'madi (${String(letters)} harf, shift ${String(MAX_TOTAL_LETTERS)})`,
      };
    }
  }

  return {
    ok: false,
    reason: `o'yin: ${String(got)} ta yaroqli element qaytdi, so'ralgani ${String(itemCount)}`,
  };
}

function countItems(content: GameContent): number {
  switch (content.kind) {
    case "wheel":
      return content.sectors.length;
    case "word-search":
      return content.words.length;
    case "anagram":
      return content.items.length;
  }
}
