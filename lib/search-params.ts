/**
 * `searchParams` ni o'qish va qayta qurish uchun umumiy yordamchilar.
 *
 * Sehrgar (`lib/generation/wizard-params.ts`) va hujjatlar ro'yxati
 * (`lib/documents/list-params.ts`) ikkisi ham holatni URL'da saqlaydi va
 * ikkisi ham aynan shu ikki ishni qiladi: Next'dan kelgan
 * `string | string[] | undefined` dan bitta qiymat olish, va `<Link>` uchun
 * `Record<string, string>` qurish. Shuning uchun yordamchilar bu yerda —
 * ikki faylda takrorlanib, keyin bir-biridan ajralib ketmasligi uchun.
 *
 * Sof modul: React ham, Prisma ham, next/* ham import qilinmaydi.
 */

/** Next 16 `searchParams` ning yechilgan shakli. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * `wizardQuery` / `listQuery` ga uzatiladigan qiymat.
 *
 * `null` va `undefined` ikkisi ham "bu kalitni query'ga qo'shmaslik" degani:
 * `<Link href={{query}}>` da bo'sh kalit ham URL'da ko'rinib qoladi
 * (`?chorak=`), u esa ulashilgan havolani xunuk qiladi va parser uchun
 * `undefined` dan farq qilmaydi.
 */
export type QueryValue = string | number | readonly string[] | null | undefined;

/**
 * Takrorlangan maydondan BIRINCHI qiymatni oladi.
 *
 * Nega birinchi: `<select name="fan">` ikki marta yuborilsa (masalan
 * brauzer avtomatik to'ldirishi) Next massiv beradi. Oxirgisini olish
 * ham mumkin edi, lekin birinchisi forma tartibiga mos.
 */
export function readOne(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? null) : null;
  return value ?? null;
}

/**
 * Butun son o'qiydi va chegaraga qisadi.
 *
 * Hech qachon throw qilmaydi va `NaN` qaytarmaydi — noto'g'ri qiymat
 * `null` bo'ladi, chaqiruvchi esa default qo'yadi. `"abc"`, `""`, `"1.5"`,
 * `"1e9"`, `"-3"` — hammasi shu yo'ldan o'tadi.
 */
export function readInt(
  value: string | string[] | undefined,
  opts: { min?: number; max?: number } = {},
): number | null {
  const raw = readOne(value);
  if (raw === null || raw.trim() === "") return null;
  // `Number` emas, `/^-?\d+$/`: `Number("1e9")` 1000000000 beradi,
  // `Number("1.5")` esa 1.5 — ikkisi ham URL'da butun son sifatida
  // kutilmaydi va jimgina noto'g'ri qiymatga aylanardi.
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed)) return null;
  if (opts.min !== undefined && parsed < opts.min) return null;
  if (opts.max !== undefined && parsed > opts.max) return null;
  return parsed;
}

/** Matn o'qiydi: trim qiladi va uzunlikni cheklaydi. Bo'sh bo'lsa `""`. */
export function readText(
  value: string | string[] | undefined,
  maxLength: number,
): string {
  const raw = readOne(value);
  if (raw === null) return "";
  return raw.trim().slice(0, maxLength);
}

/**
 * Takrorlangan YOKI vergul bilan ajratilgan ro'yxatni o'qiydi.
 *
 * Ikkala shakl ham kerak: forma `?turlar=mcq&turlar=short` yuboradi,
 * qo'lda qurilgan `<Link>` esa `?turlar=mcq,short` beradi. Bo'sh
 * bo'laklar tashlanadi.
 */
export function readList(value: string | string[] | undefined): string[] {
  const parts = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return parts
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * `<Link href={{ query }}>` uchun `Record<string, string>` quradi.
 *
 * `null`/`undefined`/bo'sh satr/bo'sh massiv tushib qoladi; massiv vergul
 * bilan birlashtiriladi (`readList` uni qaytib o'qiydi).
 */
export function buildQuery(
  entries: Record<string, QueryValue>,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      query[key] = value.join(",");
      continue;
    }
    const text = String(value);
    if (text === "") continue;
    query[key] = text;
  }
  return query;
}
