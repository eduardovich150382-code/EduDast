import { readOne, type RawSearchParams } from "@/lib/search-params";
import { gameSeed } from "./seed";

/**
 * `?variant=N` — bir mazmundan bir necha xil varaq (15-sessiya).
 *
 * NEGA KERAK: spetsifikatsiyaning asosiy sababi — yonma-yon o'tirgan
 * o'quvchilar bir-biridan KO'CHIRA OLMASIN. Shuning uchun bu parametr
 * IKKALA sahifada ham o'qiladi: doskada ham, CHOP ETILADIGAN VARAQDA ham.
 * Faqat doskada ishlasa g'oya eng kerakli joyda ishlamay qolardi.
 *
 * TEMIR QOIDA (`lib/slides/player-params.ts` bilan bir xil): noto'g'ri
 * qiymat HECH QACHON throw qilmaydi va 500 bermaydi — jimgina 0-variantga
 * tushadi. Ulashilgan havola qo'lda tahrirlanadi va buzuq URL dars
 * o'rtasida xato ekrani ko'rsatmasligi kerak.
 *
 * NOMI INGLIZCHA — `?variant`, loyihadagi boshqa parametrlar esa o'zbekcha
 * (`?izoh`, `?rejim`, `?slayd`). Sabab: spetsifikatsiya aynan shu nomni
 * yozadi va o'qituvchiga aytiladigan ko'rsatma ham shu bo'ladi ("havolaga
 * ?variant=2 qo'shing"). Nomni o'zbekchalashtirish hujjat bilan kodni
 * ajratib yuborardi.
 */

export const VARIANT_PARAM = "variant";

/** 0 — asl variant (blokdagi urug'). */
export const DEFAULT_VARIANT = 0;

/**
 * Variantlarning yuqori shifti.
 *
 * Nega shift bor: `?variant=999999` ham ishlardi, lekin o'qituvchiga
 * ma'nosi yo'q va "qaysi variantni bergan edim" degan savolni
 * javobsiz qoldirardi. To'rtta variant spetsifikatsiyadagi "4-variant"
 * g'oyasini to'liq qoplaydi (bir sinfda to'rt qator).
 */
export const MAX_VARIANT = 3;

/**
 * `searchParams` -> variant raqami.
 *
 * Shiftdan oshgan, manfiy, kasr yoki harfli qiymat — hammasi
 * `DEFAULT_VARIANT` ga tushadi.
 */
export function readVariant(raw: RawSearchParams): number {
  const value = readOne(raw[VARIANT_PARAM]);
  if (value === null) return DEFAULT_VARIANT;

  // `Number.parseInt` ISHLATILMAYDI: u `"2abc"` ni 2 deb o'qiydi, ya'ni
  // buzuq URL jimgina "to'g'ri" variant berardi.
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_VARIANT;
  if (parsed < DEFAULT_VARIANT || parsed > MAX_VARIANT) return DEFAULT_VARIANT;
  return parsed;
}

/**
 * Variantga mos urug'.
 *
 * 0-VARIANT BLOKDAGI URUG'NI QAYTARADI, qaytadan hisoblamaydi. Ikkisi bir
 * xil funksiyadan chiqqani uchun natija baribir teng bo'lardi, lekin
 * blokdagi qiymatni ishlatish blokni O'Z-O'ZICHA to'liq qiladi: hujjat
 * eksport qilinsa yoki boshqa joyda ochilsa ham ayni o'yin chiqadi,
 * `documentId` ga bog'lanmagan holda.
 */
export function seedForVariant(input: {
  documentId: string;
  blockSeed: number;
  variant: number;
}): number {
  if (input.variant === DEFAULT_VARIANT) return input.blockSeed;
  return gameSeed(input.documentId, input.variant);
}

/** `?variant=N` qo'shilgan havola. 0 uchun parametr YOZILMAYDI. */
export function variantHref(pathname: string, variant: number): string {
  if (variant === DEFAULT_VARIANT) return pathname;
  return `${pathname}?${VARIANT_PARAM}=${String(variant)}`;
}

/** Tanlash uchun variantlar ro'yxati: `[0, 1, 2, 3]`. */
export const VARIANTS: readonly number[] = Array.from(
  { length: MAX_VARIANT - DEFAULT_VARIANT + 1 },
  (_, i) => DEFAULT_VARIANT + i,
);
