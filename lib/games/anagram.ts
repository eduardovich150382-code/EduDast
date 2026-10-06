import { mulberry32, shuffle, type Rng } from "./seed";
import type { AnagramContent, BuiltAnagram, BuiltAnagramItem } from "./types";

/**
 * Anagramma — sof algoritm (15-sessiya, 2-qatlam).
 *
 * Model so'z va ta'rif beradi, HARFLARNI ARALASHTIRISH shu yerda bo'ladi.
 * Modeldan aralashma so'rash ikki sababga ko'ra ishlamasdi: u harflarni
 * yo'qotadi yoki qo'shib qo'yadi, va natija deterministik emas — ya'ni
 * `?variant` ishlamasdi.
 */

/**
 * Asl so'zga teng chiqmaslik uchun qayta aralashtirish urinishlari.
 *
 * Sxema so'zdan KAMIDA IKKI XIL HARF talab qiladi (`normalizeWord`), ya'ni
 * aralashtirib bo'lmaydigan so'z (`AAA`) mazmunga umuman kirmaydi. Shu
 * sababli bu halqa amalda bir-ikki qadamda tugaydi; chegara esa cheksiz
 * halqadan himoya.
 */
const MAX_SHUFFLE_TRIES = 12;

/**
 * Harflarni aralashtiradi. Natija asl so'zga TENG EMAS.
 *
 * Oxirgi chora — SIKLIK SURISH: u har doim ishlaydi (kamida ikki xil harfli
 * so'zda bir qadamlik surish so'zni albatta o'zgartiradi) va shuning uchun
 * funksiya hech qachon asl so'zni qaytarmaydi.
 */
export function scramble(rng: Rng, word: string): string[] {
  const letters = [...word];

  for (let tries = 0; tries < MAX_SHUFFLE_TRIES; tries += 1) {
    const candidate = shuffle(rng, letters);
    if (candidate.join("") !== word) return candidate;
  }

  return rotate(letters);
}

/** Bir qadamlik siklik surish: `ABCD` -> `BCDA`. */
function rotate(letters: readonly string[]): string[] {
  let shift = 1;
  while (shift < letters.length) {
    const candidate = [...letters.slice(shift), ...letters.slice(0, shift)];
    if (candidate.join("") !== letters.join("")) return candidate;
    shift += 1;
  }
  // Bu yerga faqat bir xil harfli so'z bilan yetib kelinadi, uni esa sxema
  // kesadi. Baribir massiv qaytariladi: `throw` qilsak chop etish paytida
  // oq ekran bo'lardi.
  return [...letters];
}

/**
 * Elementlar MAZMON TARTIBIDA qoladi, aralashmaydi.
 *
 * Savollar tartibini aralashtirish ham mumkin edi, lekin varaqdagi ta'riflar
 * tartibi bilan javoblar kaliti tartibi mos kelishi kerak va o'qituvchi
 * "3-savol" deb atasa u ikki render'da bir xil savol bo'lishi kerak.
 * `?variant` farqni ARALASHMADA beradi, tartibda emas.
 */
export function buildAnagram(content: AnagramContent, seed: number): BuiltAnagram {
  const rng = mulberry32(seed);

  const items: BuiltAnagramItem[] = content.items.map((item) => ({
    word: item.word,
    clue: item.clue,
    scrambled: scramble(rng, item.word),
  }));

  return { kind: "anagram", items };
}
