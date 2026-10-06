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
