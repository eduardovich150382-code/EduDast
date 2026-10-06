/**
 * Panjara sig'imi — mazmun sxemasi va algoritm UCHALASI uchun bitta manba.
 *
 * NEGA ALOHIDA MODUL: `content.ts` bu sonlarga muhtoj (mazmunni qabul
 * qilishdan oldin sig'imni tekshirish uchun), `word-search.ts` ham. Lekin
 * `types.ts` `content.ts` dan tur import qiladi, ya'ni `content.ts` ->
 * `word-search.ts` yo'li haqiqiy aylanma bog'liqlik yasardi. Shu modulning
 * IMPORTI YO'Q, shuning uchun ikkalasi ham undan erkin o'qiydi.
 */

/** Panjara o'lchami — spetsifikatsiya belgilagan 12x12. */
export const GRID_SIZE = 12;

/**
 * So'zlardagi JAMI harf soni uchun shift.
 *
 * O'LCHANGAN SON, taxmin emas. `buildWordSearch` nomzod joylarni to'liq
 * sanaydi, ya'ni "joy bo'lsa topadi", lekin joyning o'zi tugashi mumkin:
 * 144 katakka 140 harf (14 x 10) sig'dirish 97% zichlik degani.
 *
 * Kam kesishadigan sun'iy so'zlar bilan o'lchangan yiqilish ulushi
 * (300 urug', har biri 4 urinish):
 *
 *   140 harf (14x10)  9.33%
 *   126 harf (14x9)   0.33%
 *   112 harf (14x8)   0.00%
 *   104 harf (13x8)   0.00%
 *
 * Shift 112 da: o'lchovda nol va hali ham keng (14 ta o'rtacha 8 harfli
 * so'z, yoki 11 ta 10 harfli). Haqiqiy o'zbek so'zlari sun'iylardan ko'p
 * kesishadi, ya'ni amalda zapas bundan ham katta — lekin shift o'lchangan
 * eng yomon holatga qo'yiladi, umidga emas.
 *
 * MUHIM: shift mazmun SXEMASIDA ham turadi (`lib/games/content.ts`).
 * Shuning uchun "ro'yxatdagi har so'z panjarada bor" kafolati sxemadan
 * o'tgan HAR mazmun uchun amal qiladi, "odatda" emas.
 */
export const MAX_TOTAL_LETTERS = 112;

/**
 * PROMPTGA aytiladigan so'z uzunligi oralig'i.
 *
 * Sxema 3-10 harfga ruxsat beradi (`lib/games/alphabet.ts`), bu oraliq esa
 * TORROQ va ataylab: model shuni bajarsa jami harf shiftiga URILMAYDI.
 *
 *   12 so'z x 8 harf = 96  — shiftda 16 harf zapas.
 *   12 so'z x 9 harf = 108 — zapas 4, ya'ni bitta uzun so'z yetarli.
 *
 * Pastki chegara 4: uch harfli so'z 12x12 panjarada tasodifan ham paydo
 * bo'lib qoladi va bola uni "topgan" bo'lib hisoblardi.
 *
 * Oraliq sxemaning ICHIDA, shuning uchun modelning mos javobi har doim
 * parse bo'ladi; mos kelmagani esa `normalizeWord` dan o'tadi-u,
 * `fitLetters` da tashlanishi mumkin.
 */
export const PREFERRED_WORD_MIN = 4;
export const PREFERRED_WORD_MAX = 8;

/**
 * So'z qidirishda modeldan qancha ZAPAS so'raladi.
 *
 * O'LCHOV ASOSIDA. To'rtta haqiqiy generatsiyada uchtasi yiqildi va
 * sababi har uchalasida bir xil: model mukammal o'zbek atamalarini
 * qaytardi, lekin bir-ikkitasi `MAX_WORD_LENGTH` (10 harf) dan uzun edi
 * — `ishqalanish` (11), `trayektoriya` (12), `solishtirma` (11). O'zbek
 * fizika terminologiyasi UZUN, ya'ni bu tizimli hol.
 *
 * Darvoza aniq sonni talab qiladi va QAYTA URINISH YO'Q, shuning uchun
 * bitta uzun atama butun generatsiyani yiqitardi. Zapas har xil
 * tashlanishni qoplaydi: uzun so'z, yaroqsiz belgi, takrorlanish,
 * byudjetga sig'maslik.
 *
 * SON IKKI JOYDA ISHLATILADI — sistema promptidagi quyruq (`gameTail`)
 * va bosqich ko'rsatmasi (`gameStageInstruction`). Ular ajralsa model
 * ziddiyatli ikki talabni ko'radi va SISTEMA promptiga ishonadi:
 * o'lchovda aynan shu yuz berdi (quyruq "aynan 10" deyardi, ko'rsatma
 * "14 ta" so'rardi, model 10 ta berib yiqilardi). Shuning uchun son shu
 * yerda, bitta joyda.
 */
export const WORD_REQUEST_BUFFER = 4;
