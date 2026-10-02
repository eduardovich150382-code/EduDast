import {
  documentTypeFor,
  readTypeParam,
  typeParamFor,
  type SupportedDocumentType,
} from "@/lib/documents/type-param";
import type { DocumentStatus } from "@/lib/generated/prisma/client";
import {
  buildQuery,
  readInt,
  readOne,
  readText,
  type QueryValue,
  type RawSearchParams,
} from "@/lib/search-params";

/**
 * `/ish/hujjatlar` filtrlari va sahifalash — holat URL'da.
 *
 * Sof modul (React/Prisma import qilinmaydi), shuning uchun
 * `tests/documents-list-params.test.ts` butun mantiqni tekshiradi.
 */

/** Bir sahifadagi hujjat soni. */
export const PER_PAGE = 20;

/**
 * Sahifa shifti.
 *
 * `skip` cheksiz o'sa olmaydi: Postgres `OFFSET` ni baribir skanerlaydi, va
 * ulashilgan havolada `?sahifa=1000000` bo'lsa bu bekorga sekin so'rov
 * bo'lardi. 500 sahifa = 10 000 hujjat, bu o'qituvchi uchun yetib
 * bo'lmaydigan son.
 */
export const MAX_PAGE = 500;

/** Sarlavha qidiruvi uzunligi. */
export const MAX_QUERY_LENGTH = 80;

/**
 * `?holat=` URL taxalluslari.
 *
 * Baza enum nomi (`QUEUED`) URL'ga chiqmaydi — `?tur=` bilan bir xil sabab
 * (`lib/documents/type-param.ts`).
 */
export const STATUS_PARAM = {
  navbatda: "QUEUED",
  tayyorlanmoqda: "RUNNING",
  tayyor: "DONE",
  yiqildi: "FAILED",
} as const satisfies Record<string, DocumentStatus>;

export type StatusParam = keyof typeof STATUS_PARAM;

const PARAM_BY_STATUS: Record<DocumentStatus, StatusParam> = {
  QUEUED: "navbatda",
  RUNNING: "tayyorlanmoqda",
  DONE: "tayyor",
  FAILED: "yiqildi",
};

/** `"DONE"` -> `"tayyor"`. URL qurishda. */
export function statusParamFor(status: DocumentStatus): StatusParam {
  return PARAM_BY_STATUS[status];
}

export type ListParams = {
  page: number;
  type: SupportedDocumentType | null;
  status: DocumentStatus | null;
  query: string;
};

export type ListParamName = "sahifa" | "tur" | "holat" | "q";
export type ListOverrides = Partial<Record<ListParamName, QueryValue>>;

/** Filtrni o'zgartiradigan parametrlar — sahifani nolga qaytaradiganlar. */
const FILTER_NAMES: readonly ListParamName[] = ["tur", "holat", "q"];

function readStatus(value: string | null): DocumentStatus | null {
  if (value === null) return null;
  return value in STATUS_PARAM ? STATUS_PARAM[value as StatusParam] : null;
}

/** `searchParams` -> `ListParams`. Hech qachon throw qilmaydi. */
export function parseListParams(raw: RawSearchParams): ListParams {
  const typeParam = readTypeParam(readOne(raw.tur));

  return {
    // Noto'g'ri sahifa 1 ga tushadi: `?sahifa=0`, `?sahifa=-3`,
    // `?sahifa=abc`, `?sahifa=1e9` — hammasi shu yo'ldan.
    page: readInt(raw.sahifa, { min: 1, max: MAX_PAGE }) ?? 1,
    type: typeParam === null ? null : documentTypeFor(typeParam),
    status: readStatus(readOne(raw.holat)),
    query: readText(raw.q, MAX_QUERY_LENGTH),
  };
}

/** `skip` — Prisma uchun. */
export function listSkip(params: ListParams): number {
  return (params.page - 1) * PER_PAGE;
}

/**
 * `<Link href={{ query }}>` uchun query quradi.
 *
 * FILTR O'ZGARSA SAHIFA 1 GA QAYTADI. Bu klassik xatoni oldini oladi:
 * o'qituvchi 4-sahifada turib "faqat testlar" filtrini bosadi, testlar esa
 * 2 ta — natijada bo'sh ekran chiqib, filtr buzuq ko'rinadi. Override
 * `sahifa` ni ANIQ bergan bo'lsa (pager havolalari) bu qoida ishlamaydi.
 */
export function listQuery(
  params: ListParams,
  overrides: ListOverrides = {},
): Record<string, string> {
  const filterChanged = FILTER_NAMES.some((name) => name in overrides);
  const keepPage = "sahifa" in overrides;

  const base: Record<ListParamName, QueryValue> = {
    // 1-sahifa URL'ga yozilmaydi — `buildQuery` `null` ni tashlaydi, shunda
    // birinchi sahifaning havolasi toza qoladi.
    sahifa: params.page > 1 ? params.page : null,
    tur: params.type === null ? null : typeParamFor(params.type),
    holat: params.status === null ? null : statusParamFor(params.status),
    q: params.query,
  };

  const merged = { ...base, ...overrides };
  if (filterChanged && !keepPage) merged.sahifa = null;
  return buildQuery(merged);
}
