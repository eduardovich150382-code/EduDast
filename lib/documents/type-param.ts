import type { DocumentType } from "@/lib/generated/prisma/client";

/**
 * `?tur=` URL taxalluslari — sehrgar va hujjatlar ro'yxati uchun BITTA lug'at.
 *
 * Nega taxallus kerak: URL'da `?tur=LESSON_PLAN` emas, `?tur=dars` turadi.
 * Sabab loyihadagi boshqa marshrutlar bilan bir xil (`yarat`, `hujjatlar`,
 * `fan`, `sinf`) — havola o'qituvchining tilida bo'lsin, va baza enum nomi
 * tashqi yuzaga chiqmasin (enum qiymatini qayta nomlash URL'ni buzmasin).
 *
 * Ikki ekran bitta lug'atdan oziqlanadi: sehrgarda `?tur=test` nimani
 * bildirsa, hujjatlar filtrida ham aynan shuni bildiradi.
 */
export const TYPE_PARAM = {
  dars: "LESSON_PLAN",
  test: "TEST",
  taqdimot: "SLIDES",
  oyin: "GAME",
} as const;

export type TypeParam = keyof typeof TYPE_PARAM;

/**
 * Sehrgar qo'llab-quvvatlaydigan hujjat turlari.
 *
 * `DocumentType` ning O'ZI emas: sxemada `CROSSWORD` va `GUIDE` ham bor,
 * lekin ular uchun konveyer yo'q (`lib/generation/run-stage.ts` ularni
 * ataylab yiqitadi). Shu tur TypeScript darajasida sehrgarga faqat
 * ishlaydigan turlarni kiritadi.
 */
export type SupportedDocumentType = (typeof TYPE_PARAM)[TypeParam];

// `TYPE_PARAM` qiymatlari haqiqatan `DocumentType` enum a'zosi ekanini
// kompilyatsiya paytida tekshiradi: enum qiymati qayta nomlansa, bu yerda
// xato chiqadi — URL taxallusi jimgina o'lik qolmaydi.
const _typeCheck: Record<TypeParam, DocumentType> = TYPE_PARAM;
void _typeCheck;

const PARAM_BY_TYPE: Record<SupportedDocumentType, TypeParam> = {
  LESSON_PLAN: "dars",
  TEST: "test",
  SLIDES: "taqdimot",
  GAME: "oyin",
};

/** `"dars"` -> `"dars"`, boshqa hamma narsa -> `null` (default chaqiruvchida). */
export function readTypeParam(value: string | null): TypeParam | null {
  if (value === null) return null;
  return value in TYPE_PARAM ? (value as TypeParam) : null;
}

/** `"TEST"` -> `"test"`. URL qurishda ishlatiladi. */
export function typeParamFor(type: SupportedDocumentType): TypeParam {
  return PARAM_BY_TYPE[type];
}

/** `"test"` -> `"TEST"`. */
export function documentTypeFor(param: TypeParam): SupportedDocumentType {
  return TYPE_PARAM[param];
}

/**
 * `DocumentType` -> konveyer qo'llab-quvvatlaydigan tur, yoki `null`.
 *
 * `PARAM_BY_TYPE` kalitlari bo'yicha tekshiradi, ya'ni yangi tur qo'shilganda
 * bu funksiya o'zi moslashadi. Ilgari chaqiruvchida ternar zanjiri turardi
 * (`type === "TEST" ? ... : type === "LESSON_PLAN" ? ... : null`) va u har
 * yangi tur bilan uzayardi — qo'shish esdan chiqsa tur jimgina
 * "qo'llab-quvvatlanmagan" bo'lib qolardi.
 */
export function readSupportedType(type: DocumentType): SupportedDocumentType | null {
  return type in PARAM_BY_TYPE ? (type as SupportedDocumentType) : null;
}
