import { buildQuery, readOne, type QueryValue, type RawSearchParams } from "@/lib/search-params";

/**
 * Pleyer ko'rinishining holati — URL'DA, klient holatida EMAS.
 *
 * NEGA URL: (1) ulashiladi va reload'dan omon qoladi, (2) sahifa server
 * component bo'lib qoladi, ya'ni slaydlar HTML bilan keladi va internet
 * uzilsa ham taqdimot davom etadi, (3) JavaScript'siz ham ishlaydi,
 * (4) chop etilgan natija o'qituvchi EKRANDA ko'rayotgan narsaga mos
 * keladi — klient holati bo'lsa `window.print()` boshqa narsani chiqarardi.
 *
 * Parametr QIYMATLARI oshkor lug'at bilan lokalizatsiya qilinadi
 * (`lib/documents/type-param.ts` dagi `TYPE_PARAM` naqshi): URL'da
 * `?rejim=presenter` emas, `?rejim=notiq` turadi.
 *
 * TEMIR QOIDA (sehrgar bilan bir xil): noto'g'ri qiymat HECH QACHON throw
 * qilmaydi va 500 bermaydi — jimgina default'ga tushadi. Ulashilgan havola
 * qo'lda tahrirlanadi, va buzuq URL dars o'rtasida xato ekrani
 * ko'rsatmasligi kerak.
 */

/** `?rejim=notiq` — o'qituvchi ko'rinishi. */
export const PRESENTER_PARAM = "rejim";
export const PRESENTER_VALUE = "notiq";

/** `?izoh=bor|yoq` — izohlarni ko'rsatish. Chop etishda ham shu hal qiladi. */
export const NOTES_PARAM = "izoh";
export const NOTES_VALUES = { bor: true, yoq: false } as const;

export type PlayerView = {
  presenter: boolean;
  notes: boolean;
};

/** `true` -> `"bor"`. Lug'at ikki yo'nalishda bitta manbadan oziqlanadi. */
function notesParamFor(value: boolean): string {
  return value ? "bor" : "yoq";
}

/**
 * `searchParams` -> ko'rinish holati.
 *
 * `notes` DEFAULTI REJIMGA BOG'LIQ: oddiy pleyerda izoh yopiq (u ekranga
 * chiqadi va sinf uni ko'rardi), notiq ko'rinishida esa ochiq — izoh
 * o'qituvchi uchun o'sha ko'rinishning butun MAQSADI.
 */
export function readPlayerView(raw: RawSearchParams): PlayerView {
  const presenter = readOne(raw[PRESENTER_PARAM]) === PRESENTER_VALUE;
  const notesRaw = readOne(raw[NOTES_PARAM]);
  // `Object.hasOwn`, `in` EMAS: `in` prototip zanjirini kezadi, ya'ni
  // `?izoh=toString` lug'atdan `Object.prototype.toString` ni topib,
  // `notes` ga BOOLEAN O'RNIGA FUNKSIYA qo'yardi — tur darajasida ko'rinmas,
  // runtime'da esa `notes && ...` har doim rost bo'lib qolardi.
  const notes =
    notesRaw !== null && Object.hasOwn(NOTES_VALUES, notesRaw)
      ? NOTES_VALUES[notesRaw as keyof typeof NOTES_VALUES]
      : presenter;

  return { presenter, notes };
}

/**
 * Ko'rinish holatidan `<Link href={{ query }}>` uchun query quradi.
 *
 * `overrides` — `null` kalitni O'CHIRADI (`buildQuery` qoidasi), ya'ni
 * default holatga qaytish URL'ni tozalaydi.
 *
 * `izoh` HAR DOIM yoziladi (default bilan mos kelsa ham): havola chop etish
 * uchun ulashilganda "izohsiz" holati ANIQ bo'lishi kerak, aks holda
 * qabul qiluvchining rejimi defaultni boshqacha hal qilardi.
 */
export function playerQuery(
  view: PlayerView,
  overrides: Partial<Record<typeof PRESENTER_PARAM | typeof NOTES_PARAM, QueryValue>> = {},
): Record<string, string> {
  const base: Record<string, QueryValue> = {
    [PRESENTER_PARAM]: view.presenter ? PRESENTER_VALUE : null,
    [NOTES_PARAM]: notesParamFor(view.notes),
  };
  return buildQuery({ ...base, ...overrides });
}
