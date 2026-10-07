/**
 * O'yin panjarasi va plitkalari uchun harf alifbosi (15-sessiya).
 *
 * MUAMMO: o'zbek lotin yozuvida `o'`, `g'`, `sh`, `ch`, `ng` bor, panjara
 * katagi esa BITTA belgi tutadi. Shuning uchun so'z panjaraga tushishdan
 * oldin normallashtiriladi.
 *
 * IKKITA ALIFBO, BITTA EMAS — va bu eng oson yo'ldan ketganda jimgina
 * buziladigan joy:
 *
 *   O'zbek lotinida YOLG'IZ `c` harfi yo'q, lekin `ch` DIGRAFI bor va u eng
 *   chastotalilardan biri (`chiziq`, `kuch`, `uchburchak`, `o'quvchi`).
 *   Agar alifbodan `C` chiqarilsa, `normalizeWord` `ch` li HAR BIR so'zda
 *   `null` qaytarardi, ya'ni lug'atning katta qismi yo'qolardi — va
 *   "yaroqsiz so'z tashlanadi" qoidasi buni normal hol deb bilgani uchun
 *   HECH BIR TEST YIQILMASDI. Shu sababli:
 *
 *   - `WORD_ALPHABET` — so'zda ruxsat etilgan harflar, `C` BOR;
 *   - `FILLER_ALPHABET` — bo'sh katakni to'ldirish uchun, `C` YO'Q
 *     (yolg'iz `C` panjarada o'zbek ko'ziga g'alati ko'rinadi).
 *
 * Ikkalasida ham `W` yo'q: u o'zbek lotin alifbosiga kirmaydi.
 */

/** So'zda ruxsat etilgan harflar. `C` faqat `CH` ichida keladi, lekin BOR. */
export const WORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVXYZ";

/** Bo'sh katakni tasodifiy to'ldirish uchun — yolg'iz `C` dan tashqari. */
export const FILLER_ALPHABET = "ABDEFGHIJKLMNOPQRSTUVXYZ";

const WORD_LETTERS = new Set(WORD_ALPHABET);

/** Eng qisqa so'z — har ikki o'yinda bir xil. */
export const MIN_WORD_LENGTH = 3;

/**
 * ENG UZUN SO'Z — O'YIN TURIGA QARAB, UMUMIY EMAS.
 *
 * Ilgari bitta `MAX_WORD_LENGTH = 10` ikkala o'yinga ham qo'llanardi va
 * bu ANAGRAMMADA XATO edi: u yerda panjara yo'q, harflar plitkada turadi,
 * ya'ni uzunlikni cheklash uchun geometrik sabab yo'q. Natijada
 * `kondensatsiya` (13), `trayektoriya` (12), `ishqalanish` (11) kabi
 * atamalar anagrammaga ham tusha olmasdi — holbuki aynan ular uchun
 * anagramma eng mos o'yin.
 *
 * `GRID_WORD_MAX` — PANJARA sababi: 12x12 panjarada 11-12 harfli so'z
 * faqat to'liq qator, ustun yoki diagonalga sig'adi, ya'ni ko'z bilan
 * darhol ko'rinadi va qolgan so'zlarga joy qoldirmaydi.
 *
 * `TILE_WORD_MAX` — PLITKA sababi: plitkalar qatorga sig'ishi kerak.
 * 16 harf smart doskada ham, A4 varaqda ham bir-ikki qatorda chiqadi;
 * bundan uzun atama esa bola uchun topishga emas, sanashga aylanadi.
 */
export const GRID_WORD_MAX = 10;
export const TILE_WORD_MAX = 16;

/**
 * Tashqi so'zni panjara harflariga o'giradi, yaroqsiz bo'lsa `null`.
 *
 * Nima qiladi:
 *   1. bo'sh joyni kesadi va katta harfga o'giradi;
 *   2. APOSTROFNI TASHLAYDI — `o'zbek` -> `OZBEK`, `g'isht` -> `GISHT`.
 *      Uchala apostrof shakli (`'`, `ʻ`, `’`) ham qabul qilinadi, chunki
 *      model va o'qituvchi turlichasini yozadi;
 *   3. `WORD_ALPHABET` dan tashqarida belgi qolsa `null`.
 *
 * NEGA APOSTROF TASHLANADI, KATAKKA QO'YILMAYDI: panjarada `O'` ikki katak
 * bo'lardi va "birinchi va oxirgi harfni bosish" mexanikasi harf sonini
 * sanashda chalkashardi. Varaqdagi so'zlar ro'yxatida ham AYNAN SHU
 * normallashgan shakl ko'rsatiladi — aks holda bola ro'yxatdagi `O'ZBEK` ni
 * panjarada izlab topolmasdi.
 *
 * `maxLength` MAJBURIY PARAMETR, default'i YO'Q — har chaqiruvchi qaysi
 * o'yin uchun normallashtirayotganini OSHKOR aytishi kerak
 * (`GRID_WORD_MAX` yoki `TILE_WORD_MAX`). Default qo'yilsa, yangi
 * chaqiruvchi uni e'tiborsiz qoldirib panjara shiftini anagrammaga
 * qo'llab yuborardi — aynan shu xato 15-sessiyada bo'lgan.
 */
export function normalizeWord(raw: string, maxLength: number): string | null {
  const upper = raw.trim().toUpperCase();
  let out = "";

  for (const char of upper) {
    if (char === "'" || char === "ʻ" || char === "’" || char === "ʼ") {
      continue;
    }
    if (!WORD_LETTERS.has(char)) return null;
    out += char;
  }

  if (out.length < MIN_WORD_LENGTH || out.length > maxLength) return null;

  // KAMIDA IKKI XIL HARF: bir xil harfdan iborat so'zni (`AAA`) aralashtirib
  // bo'lmaydi, ya'ni anagramma "natija asl so'zga teng emas" shartini
  // bajara olmasdi. Bu holni sxema darajasida kesish `buildAnagram` ichida
  // hech qachon yuzaga chiqmaydigan tarmoq saqlashdan arzon.
  if (new Set(out).size < 2) return null;

  return out;
}
