import { z } from "zod";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, normalizeWord } from "./alphabet";
import { MAX_TOTAL_LETTERS } from "./grid";

/**
 * O'yin MAZMUNI — AI yozadigan yagona qism (15-sessiya, 1-qatlam).
 *
 * BU SXEMA `runLlm` GA BERILMAYDI. `lib/documents/blocks.ts:6-23` dagi
 * ogohlantirish bu yerga ham to'liq tegishli: union'dan `z.toJSONSchema`
 * `oneOf` + `$ref` chiqaradi va u Gemini zanjirida jimgina
 * `invalid_output` ga aylanadi. Modelga `lib/generation/plans-game.ts` dagi
 * TEKIS sxema ketadi, natija esa sof TS kodi bilan shu yerdagi shaklga
 * o'giriladi.
 *
 * PANJARA, JOYLASHUV VA ARALASHMA BU YERDA YO'Q — ular `seed` dan sof
 * algoritm bilan qayta hisoblanadi (`lib/games/*.ts`). Sabab spetsifikatsiyada:
 * model kesishgan harflarni deyarli hech qachon to'g'ri qilmaydi va
 * natijasini tekshirib bo'lmaydi. Qo'shimcha foyda — `contentJson` kichik
 * qoladi va `?variant` bir xil mazmundan boshqa varaq yasay oladi.
 *
 * `z.strictObject` hamma joyda: `contentJson` bazada yillab yashaydi.
 */

const txt = (max: number) => z.string().trim().min(1).max(max);

/**
 * Panjaraga/plitkaga tushadigan so'z — ALLAQACHON NORMALLASHGAN holda.
 *
 * `normalizeWord` ni sxema O'ZI chaqirib tuzatmaydi, faqat TEKSHIRADI.
 * Nega: normalizatsiya — `lib/generation/plans-game.ts` dagi o'girgichning
 * ishi, u model javobini bir marta tozalaydi. Sxema esa `contentJson` ni
 * o'qiyotganda qo'riqchi bo'lib turadi va "bazada tozalanmagan so'z bor"
 * holatini KO'RSATADI, jimgina tuzatib yubormaydi — aks holda eski buzuq
 * ma'lumot abadiy ko'rinmas bo'lib qolardi.
 */
const GridWord = z
  .string()
  .min(MIN_WORD_LENGTH)
  .max(MAX_WORD_LENGTH)
  .refine((word) => normalizeWord(word) === word, {
    error: `So'z normallashgan bo'lishi kerak: faqat ${String(MIN_WORD_LENGTH)}-${String(MAX_WORD_LENGTH)} harf, apostrofsiz, kamida ikki xil harf`,
  });

/* ------------------------------------------------------------------ */
/* Omad g'ildiragi                                                     */
/* ------------------------------------------------------------------ */

const WheelSector = z.strictObject({
  category: txt(40),
  question: txt(300),
  answer: txt(300),
});

/**
 * Sektor soni QAT'IY 8 — `.length(8)`, `min/max` emas.
 *
 * G'ildirak SVG'si 45 gradusli sektorlardan iborat va sektor soni
 * o'zgarsa geometriya ham o'zgaradi. Spetsifikatsiya 8 ni belgilagan,
 * `GAME_LIMITS.wheel` esa `min === max === 8` bilan buni narx tomonidan
 * ham qulflaydi.
 */
export const WheelContent = z
  .strictObject({
    kind: z.literal("wheel"),
    sectors: z.array(WheelSector).length(8),
  })
  .refine((content) => new Set(content.sectors.map((s) => s.category)).size === 8, {
    error: "G'ildirak kategoriyalari takrorlanmasligi kerak",
    path: ["sectors"],
  });

/* ------------------------------------------------------------------ */
/* So'z qidirish                                                       */
/* ------------------------------------------------------------------ */

/**
 * Faqat SO'ZLAR, ta'rif yo'q.
 *
 * Varaqda bolaga so'zlar RO'YXATI beriladi (spetsifikatsiya: "panjara +
 * so'zlar ro'yxati ustunlarda"), ya'ni ta'rif ishlatilmaydi. Ishlatilmagan
 * maydonni so'rash modeldan bekorga token olardi va `contentJson` ni
 * kattalashtirardi.
 */
export const WordSearchContent = z
  .strictObject({
    kind: z.literal("word-search"),
    words: z.array(GridWord).min(8).max(14),
  })
  .refine((content) => new Set(content.words).size === content.words.length, {
    error: "So'zlar takrorlanmasligi kerak",
    path: ["words"],
  })
  /**
   * PANJARA SIG'IMI — so'z soni bilan uzunligi BIRGALIKDA cheklanadi.
   *
   * `min(8).max(14)` va `GridWord` ning `max(10)` i yolg'iz o'zi yetarli
   * emas: 14 x 10 = 140 harf 144 katakli panjaraga 97% zichlik bilan
   * tushardi va o'lchovda 9% urug'da so'z joylashmay qolardi. Ya'ni
   * sxema ALGORITM BAJARA OLMAYDIGAN mazmunni qabul qilardi.
   *
   * Shu shift bilan "ro'yxatdagi har so'z panjarada bor" kafolati
   * sxemadan o'tgan HAR mazmun uchun amal qiladi (o'lchov va sabab —
   * `lib/games/grid.ts`).
   */
  .refine(
    (content) => content.words.reduce((sum, word) => sum + word.length, 0) <= MAX_TOTAL_LETTERS,
    {
      error: `So'zlardagi jami harf ${String(MAX_TOTAL_LETTERS)} dan oshmasligi kerak (12x12 panjara sig'imi)`,
      path: ["words"],
    },
  );

/* ------------------------------------------------------------------ */
/* Anagramma                                                           */
/* ------------------------------------------------------------------ */

const AnagramItem = z.strictObject({
  word: GridWord,
  /** Ta'rif — bola shu matndan so'zni topadi. Harflar aralashgan holda beriladi. */
  clue: txt(300),
});

export const AnagramContent = z
  .strictObject({
    kind: z.literal("anagram"),
    items: z.array(AnagramItem).min(6).max(12),
  })
  .refine((content) => new Set(content.items.map((i) => i.word)).size === content.items.length, {
    error: "Anagramma so'zlari takrorlanmasligi kerak",
    path: ["items"],
  });

/* ------------------------------------------------------------------ */
/* Union                                                               */
/* ------------------------------------------------------------------ */

/**
 * `kind` FAQAT SHU YERDA yashaydi, `game` blokining yuqori darajasida EMAS.
 *
 * Spetsifikatsiya blokni `{ id, type:"game", kind, content, seed }` deb
 * yozadi, lekin `kind` ni ikki joyda saqlash ikkita haqiqat manbai bo'lardi
 * va ularni sinxron tutish uchun `.refine` kerak bo'lardi. Yutuq yo'q:
 * blok baribir `contentJson` ichidagi JSON, `kind` ustun emas — `block.kind`
 * ham, `block.content.kind` ham bir xil blobni ochishni talab qiladi.
 * Shuning uchun diskriminator bitta joyda: o'qish `block.content.kind`.
 *
 * `.refine()` Zod 4 da sxema ICHIDA yashaydi va `ZodObject` ni saqlaydi,
 * ya'ni yuqoridagi refine'li sxemalar `discriminatedUnion` ga tushadi
 * (`blocks.ts:293-297` dagi ayni holat).
 */
export const GameContent = z.discriminatedUnion("kind", [
  WheelContent,
  WordSearchContent,
  AnagramContent,
]);
export type GameContent = z.infer<typeof GameContent>;

export type WheelContent = z.infer<typeof WheelContent>;
export type WordSearchContent = z.infer<typeof WordSearchContent>;
export type AnagramContent = z.infer<typeof AnagramContent>;

/**
 * Mazmundagi element soni — narx va sifat bahosi shu songa qaraydi.
 *
 * `default` TARMOG'I YO'Q: yangi o'yin turi qo'shilganda TypeScript shu
 * yerda yiqiladi va element soni jimgina `0` bo'lib qolmaydi (nol esa
 * "o'qituvchi to'lagan son bilan olgan soni farq qildi" tekshiruvini
 * ma'nosiz qilardi).
 */
export function gameItemCount(content: GameContent): number {
  switch (content.kind) {
    case "wheel":
      return content.sectors.length;
    case "word-search":
      return content.words.length;
    case "anagram":
      return content.items.length;
  }
}
