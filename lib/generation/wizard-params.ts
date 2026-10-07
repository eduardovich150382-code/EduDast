import { z } from "zod";
import { GAME_LIMITS, UNIT_LIMITS } from "@/lib/credits/cost-table";
import {
  gameKindFor,
  paramForGameKind,
  readGameKindParam,
} from "@/lib/games/registry";
import { GAME_KINDS, type GameKind } from "@/lib/games/types";
import {
  documentTypeFor,
  readTypeParam,
  typeParamFor,
  type SupportedDocumentType,
  type TypeParam,
} from "@/lib/documents/type-param";
import {
  DIFFICULTIES,
  QUESTION_KINDS,
  type Difficulty,
  type QuestionKind,
} from "@/lib/generation/prompts";
import {
  MAX_DURATION,
  MIN_DURATION,
  type StartInput,
} from "@/lib/generation/start-input";
import {
  buildQuery,
  readInt,
  readList,
  readOne,
  readText,
  type QueryValue,
  type RawSearchParams,
} from "@/lib/search-params";

/**
 * Yaratish sehrgarining HOLATI — URL'da, xotirada emas.
 *
 * NEGA searchParams: (1) brauzerning "orqaga" tugmasi va havolani ulashish
 * tekinga ishlaydi, (2) sahifa server component bo'lib qoladi, ya'ni narx
 * `creditCost()` bilan SERVERDA hisoblanadi — mijozda takrorlansa
 * ko'rsatilgan narx bilan yechilgan kredit ertami-kechmi farq qilardi,
 * (3) JavaScript'siz ham ishlaydi.
 *
 * Bu modul SOF: React ham, Prisma ham, next/* ham import qilinmaydi — shuning
 * uchun `tests/wizard-params.test.ts` butun qadam mantig'ini DOM'siz
 * tekshiradi (vitest muhiti `node`, jsdom yo'q).
 *
 * TEMIR QOIDA: noto'g'ri parametr HECH QACHON throw qilmaydi va 500
 * bermaydi — jimgina default'ga tushadi. Ulashilgan havola qo'lda
 * tahrirlanadi, va buzuq URL o'qituvchiga xato ekrani ko'rsatmasligi kerak.
 */

/* ------------------------------------------------------------------ */
/* Qadamlar                                                            */
/* ------------------------------------------------------------------ */

export const WIZARD_STEPS = ["tur", "mavzu", "param", "tasdiq"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** URL parametr nomlari — `wizardQuery` override'lari uchun tipni beradi. */
export const WIZARD_PARAM_NAMES = [
  "qadam",
  "tur",
  "fan",
  "sinf",
  "chorak",
  "mavzu",
  "q",
  "daqiqa",
  "savol",
  "turlar",
  "qiyin",
  "slayd",
  "oyin",
  "element",
] as const;
export type WizardParamName = (typeof WIZARD_PARAM_NAMES)[number];
export type WizardOverrides = Partial<Record<WizardParamName, QueryValue>>;

/* ------------------------------------------------------------------ */
/* Variantlar va default'lar                                           */
/* ------------------------------------------------------------------ */

/** Dars davomiyligi variantlari. 90 — qo'sh dars. */
export const DURATIONS: readonly number[] = [35, 45, 60, 90];
export const DEFAULT_DURATION = 45;

/**
 * Savol soni variantlari.
 *
 * Ro'yxat o'qituvchi uchun qulay sonlardan iborat, lekin `UNIT_LIMITS.TEST`
 * chegarasi bo'yicha FILTRLANADI: narx jadvali chegarasi o'zgarsa, bu ro'yxat
 * o'zi moslashadi va formada to'lanmaydigan son qolmaydi.
 */
export const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30, 40].filter(
  (count) => count >= UNIT_LIMITS.TEST.min && count <= UNIT_LIMITS.TEST.max,
);
export const DEFAULT_QUESTION_COUNT = 10;

/**
 * Slayd soni variantlari.
 *
 * `UNIT_LIMITS.SLIDES` 6-20 ga ruxsat beradi, forma esa ATAYLAB torroq:
 * spetsifikatsiya bir dars uchun 8-14 slaydni ko'zlaydi. Ro'yxatga son
 * qo'shish bir qatorlik ish, OLIB TASHLASH esa qiyin — kimdir 20 slaydli
 * taqdimot yaratgandan keyin uni ro'yxatdan chiqarish g'alati bo'ladi.
 * Shuning uchun haqiqiy foydalanish ko'rilgandan keyin kengaytiriladi.
 *
 * URL orqali 6-20 baribir ochiq (`startSchema`), ya'ni qattiq to'siq yo'q.
 */
export const SLIDE_COUNTS = [8, 10, 12, 14].filter(
  (count) => count >= UNIT_LIMITS.SLIDES.min && count <= UNIT_LIMITS.SLIDES.max,
);
export const DEFAULT_SLIDE_COUNT = 12;

/**
 * O'yin element soni variantlari — `kind` BO'YICHA.
 *
 * `QUESTION_COUNTS`/`SLIDE_COUNTS` naqshi: ro'yxat o'qituvchi uchun qulay
 * sonlardan, lekin `GAME_LIMITS` bo'yicha FILTRLANADI, ya'ni narx jadvali
 * chegarasi o'zgarsa ro'yxat o'zi moslashadi.
 *
 * G'ildirakda bitta variant (8) — sektor soni qat'iy, shuning uchun forma
 * u yerda element tanlovini KO'RSATMAYDI.
 */
export const GAME_ITEM_COUNTS: Record<GameKind, number[]> = {
  wheel: [8],
  "word-search": [8, 10, 12, 14],
  anagram: [6, 8, 10, 12],
};

for (const kind of GAME_KINDS) {
  const { min, max } = GAME_LIMITS[kind];
  GAME_ITEM_COUNTS[kind] = GAME_ITEM_COUNTS[kind].filter(
    (count) => count >= min && count <= max,
  );
}

export const DEFAULT_GAME_KIND: GameKind = "word-search";

/** `kind` uchun default element soni — ro'yxatning o'rtasiga yaqin. */
export function defaultItemCount(kind: GameKind): number {
  const counts = GAME_ITEM_COUNTS[kind];
  return counts[Math.floor(counts.length / 2)] ?? GAME_LIMITS[kind].min;
}

/** Son ro'yxatda bormi — URL'dan kelgan qiymatni tekshirish uchun. */
export function itemCountAllowed(kind: GameKind, count: number): boolean {
  return GAME_ITEM_COUNTS[kind].includes(count);
}

/**
 * Element sonini `kind` ning ro'yxatiga tortadi.
 *
 * `?element=99` yoki `kind` o'zgarganda eski son qolib ketgan holat
 * narxsiz ekran yasamasin: `creditCost` chegaradan tashqari sonni
 * `clampUnits` bilan tortadi, lekin forma ro'yxatda yo'q sonni tanlangan
 * deb ko'rsata olmasdi va o'qituvchi hech narsa tanlanmagan ekranni
 * ko'rardi.
 */
export function clampItemCount(kind: GameKind, count: number | null): number {
  if (count !== null && itemCountAllowed(kind, count)) return count;
  return defaultItemCount(kind);
}

/**
 * Standart savol turlari — `match` ATAYLAB yo'q.
 *
 * Moslashtirish savoli eng murakkab blok turi va har mavzuga mos kelmaydi;
 * o'qituvchi uni o'zi qo'shsin. Uchtasi esa har testda ishlaydi.
 */
export const DEFAULT_KINDS: readonly QuestionKind[] = [
  "mcq",
  "short",
  "truefalse",
];
export const DEFAULT_DIFFICULTY: Difficulty = "mixed";

/** `?q=` uzunligi — sarlavha qidiruvi bilan bir xil shift. */
export const MAX_QUERY_LENGTH = 80;

/* ------------------------------------------------------------------ */
/* Yechilgan parametrlar                                               */
/* ------------------------------------------------------------------ */

/**
 * O'qilgan sehrgar holati.
 *
 * DIQQAT — `duration`/`questionCount`/`kinds`/`difficulty` NULLABLE va bu
 * ataylab: `null` "o'qituvchi hali tanlamagan" degani. Agar ular default
 * bilan to'ldirilsa `paramsCompleteForType` har doim `true` bo'lib,
 * `inferStep` parametr qadamini SAKRAB o'tardi va o'qituvchi davomiylikni
 * umuman ko'rmasdan tasdiqlash ekraniga tushardi.
 *
 * Ko'rsatish va narx uchun hal qilingan qiymatlar `resolveParams` dan
 * olinadi.
 */
export type WizardParams = {
  /** `?qadam=` — so'ralgan qadam. `null` bo'lsa qadam hisoblanadi. */
  step: WizardStep | null;
  type: TypeParam | null;
  /** Fan slug'i — faqat MAVZU PIKERI holati, sehrgar uchun majburiy emas. */
  subject: string | null;
  grade: number | null;
  quarter: number | null;
  topicId: string | null;
  query: string;
  duration: number | null;
  questionCount: number | null;
  kinds: readonly QuestionKind[] | null;
  difficulty: Difficulty | null;
  slideCount: number | null;
  gameKind: GameKind | null;
  itemCount: number | null;
};

const GRADE_MIN = 1;
const GRADE_MAX = 11;
const QUARTER_MIN = 1;
const QUARTER_MAX = 4;
const TOPIC_ID_MAX = 64;

function readStep(value: string | null): WizardStep | null {
  if (value === null) return null;
  return (WIZARD_STEPS as readonly string[]).includes(value)
    ? (value as WizardStep)
    : null;
}

function readKinds(value: string | string[] | undefined): QuestionKind[] | null {
  const raw = readList(value);
  if (raw.length === 0) return null;
  // Tartib QUESTION_KINDS bo'yicha normallashtiriladi va takror tashlanadi:
  // `?turlar=short,mcq,short` va `?turlar=mcq,short` bir xil holat bo'lsin,
  // aks holda `wizardQuery` dan qaytib o'qilganda round-trip buzilardi.
  const picked = QUESTION_KINDS.filter((kind) => raw.includes(kind));
  return picked.length > 0 ? [...picked] : null;
}

function readDifficulty(value: string | null): Difficulty | null {
  if (value === null) return null;
  return (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as Difficulty)
    : null;
}

/** `searchParams` -> `WizardParams`. Hech qachon throw qilmaydi. */
export function parseWizardParams(raw: RawSearchParams): WizardParams {
  const topicId = readOne(raw.mavzu);
  const duration = readInt(raw.daqiqa, {
    min: MIN_DURATION,
    max: MAX_DURATION,
  });
  const questionCount = readInt(raw.savol, {
    min: UNIT_LIMITS.TEST.min,
    max: UNIT_LIMITS.TEST.max,
  });
  const slideCount = readInt(raw.slayd, {
    min: UNIT_LIMITS.SLIDES.min,
    max: UNIT_LIMITS.SLIDES.max,
  });
  const gameKindParam = readGameKindParam(readOne(raw.oyin));
  const gameKind = gameKindParam === null ? null : gameKindFor(gameKindParam);
  // Eng keng chegara bilan o'qiladi, `kind` ga xos tekshiruv pastda:
  // bu yerda `kind` hali ma'lum emas.
  const itemCount = readInt(raw.element, { min: 1, max: 64 });

  return {
    step: readStep(readOne(raw.qadam)),
    type: readTypeParam(readOne(raw.tur)),
    subject: readOne(raw.fan),
    grade: readInt(raw.sinf, { min: GRADE_MIN, max: GRADE_MAX }),
    quarter: readInt(raw.chorak, { min: QUARTER_MIN, max: QUARTER_MAX }),
    // Uzun `mavzu` ni KESMAYMIZ, tashlaymiz: yarim kesilgan id bazada
    // topilmaydi va "mavzu topilmadi" deb chalg'itardi.
    topicId: topicId !== null && topicId.length <= TOPIC_ID_MAX ? topicId : null,
    query: readText(raw.q, MAX_QUERY_LENGTH),
    // Variant ro'yxatida bo'lmagan son tashlanadi: narx faqat ro'yxatdagi
    // sonlar uchun ko'rsatiladi, boshqasi "narxsiz" holat yasardi.
    duration: duration !== null && DURATIONS.includes(duration) ? duration : null,
    questionCount:
      questionCount !== null && QUESTION_COUNTS.includes(questionCount)
        ? questionCount
        : null,
    kinds: readKinds(raw.turlar),
    difficulty: readDifficulty(readOne(raw.qiyin)),
    slideCount:
      slideCount !== null && SLIDE_COUNTS.includes(slideCount) ? slideCount : null,
    gameKind,
    // Element soni `kind` GA BOG'LIQ holda tekshiriladi: `kind` hali
    // tanlanmagan bo'lsa son ham qabul qilinmaydi, aks holda g'ildirakka
    // o'tганda 14 so'zlik tanlov qolib ketardi.
    itemCount:
      gameKind !== null && itemCount !== null && itemCountAllowed(gameKind, itemCount)
        ? itemCount
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Qadam mashinasi                                                     */
/* ------------------------------------------------------------------ */

/**
 * Turga qarab parametrlar to'liq tanlanganmi.
 *
 * `switch`, `if/else` EMAS — va bu butun faylda shunday (`resolveParams`,
 * `startInputFor`, `confirmQuery`, `wizardQueryFromDocument`). Sabab: ilgari
 * bu funksiyalar `if (TEST) ... else LESSON_PLAN` shaklida edi, ya'ni
 * `TYPE_PARAM` ga uchinchi tur qo'shilganda TypeScript YIQILMASDI va yangi
 * tur jimgina dars ishlanma tarmog'iga tushib ketardi — o'qituvchi taqdimot
 * so'rab dars davomiyligi ekranini ko'rardi. `default` siz `switch` esa aynan
 * shu yerda yiqiladi.
 */
export function paramsCompleteForType(params: WizardParams): boolean {
  if (params.type === null) return false;

  switch (documentTypeFor(params.type)) {
    case "TEST":
      return (
        params.questionCount !== null &&
        params.kinds !== null &&
        params.kinds.length > 0 &&
        params.difficulty !== null
      );
    case "SLIDES":
      return params.slideCount !== null;
    // G'ILDIRAKDA `itemCount` SO'RALMAYDI: sektor soni qat'iy 8, ya'ni
    // tanlov yo'q va o'qituvchiga bo'sh parametr ekranini ko'rsatish
    // ma'nosiz bo'lardi. `resolveParams` uni default bilan to'ldiradi.
    case "GAME":
      return params.gameKind !== null && (params.gameKind === "wheel" || params.itemCount !== null);
    case "LESSON_PLAN":
      return params.duration !== null;
  }
}

/**
 * Holatdan kelib chiqib o'qituvchi QAYSI qadamda turishi kerakligini aytadi.
 *
 * `topicResolved` — mavzu BAZADA tekshirilganmi (bor, o'chirilmagan, fan va
 * sinf o'qituvchining ro'yxatida). Parametrning o'zi yetarli emas: URL'dagi
 * id yo'q bo'lsa ham `params.topicId` to'ldirilgan bo'lardi.
 *
 * DIQQAT — `mavzu` YOLG'IZ O'ZI YETARLI: `fan`/`sinf` bu yerda
 * tekshirilmaydi, chunki ular faqat piker holati. `FAILED` hujjatdan
 * qurilgan "Qaytadan yaratish" havolasi fan va sinfni BILMAYDI (hujjatda
 * faqat `topicId` bor), shuning uchun ularni talab qilish o'sha havolani
 * buzardi.
 */
export function inferStep(
  params: WizardParams,
  opts: { topicResolved: boolean },
): WizardStep {
  if (params.type === null) return "tur";
  if (!opts.topicResolved) return "mavzu";
  if (!paramsCompleteForType(params)) return "param";
  return "tasdiq";
}

/**
 * So'ralgan qadamni ruxsat etilgan chegaraga soladi.
 *
 * Orqaga erkin (o'qituvchi tanlovini o'zgartirishi mumkin), oldinga sakrash
 * yo'q — aks holda `?qadam=tasdiq` bilan mavzusiz tasdiqlash ekraniga
 * tushib, "Yaratish" tugmasi `"invalid"` qaytarardi.
 */
export function resolveStep(
  requested: WizardStep | null,
  inferred: WizardStep,
): WizardStep {
  if (requested === null) return inferred;
  return WIZARD_STEPS.indexOf(requested) <= WIZARD_STEPS.indexOf(inferred)
    ? requested
    : inferred;
}

/** Qadamdan oldingisi — "Orqaga" havolasi uchun. `null` = birinchi qadam. */
export function previousStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index > 0 ? (WIZARD_STEPS[index - 1] ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* Hal qilingan qiymatlar va server kirishi                            */
/* ------------------------------------------------------------------ */

export type ResolvedParams =
  | { type: "LESSON_PLAN"; durationMinutes: number }
  | {
      type: "TEST";
      questionCount: number;
      kinds: readonly QuestionKind[];
      difficulty: Difficulty;
    }
  | { type: "SLIDES"; slideCount: number }
  | { type: "GAME"; gameKind: GameKind; itemCount: number };

/**
 * Ko'rsatish va narx uchun default bilan to'ldirilgan qiymatlar.
 *
 * `paramsCompleteForType` dan FARQLI: u "o'qituvchi tanladimi" degan
 * savolga javob beradi, bu esa "nima ko'rsatamiz" degan savolga.
 */
export function resolveParams(params: WizardParams): ResolvedParams {
  const type: SupportedDocumentType =
    params.type === null ? "LESSON_PLAN" : documentTypeFor(params.type);

  switch (type) {
    case "TEST":
      return {
        type: "TEST",
        questionCount: params.questionCount ?? DEFAULT_QUESTION_COUNT,
        kinds: params.kinds ?? DEFAULT_KINDS,
        difficulty: params.difficulty ?? DEFAULT_DIFFICULTY,
      };
    case "SLIDES":
      return { type: "SLIDES", slideCount: params.slideCount ?? DEFAULT_SLIDE_COUNT };
    case "GAME": {
      const gameKind = params.gameKind ?? DEFAULT_GAME_KIND;
      return {
        type: "GAME",
        gameKind,
        // Chegara `kind` ga bog'liq, shuning uchun default ham: g'ildirakda
        // 8 (qat'iy), qolganlarida `DEFAULT_ITEM_COUNT`. Chegaradan tashqari
        // son `clampItemCount` bilan tortiladi — `?element=99` bilan kelgan
        // havola narxsiz holat yasamasin.
        itemCount: clampItemCount(gameKind, params.itemCount),
      };
    }
    case "LESSON_PLAN":
      return { type: "LESSON_PLAN", durationMinutes: params.duration ?? DEFAULT_DURATION };
  }
}

/**
 * `boshlaGeneratsiya` uchun kirish obyekti.
 *
 * `topicId` ALOHIDA argument: u serverda bazadan tekshirilgan qiymat bo'lishi
 * kerak, URL'dan kelgan `params.topicId` emas.
 */
export function startInputFor(
  params: WizardParams,
  topicId: string,
): StartInput {
  const resolved = resolveParams(params);

  switch (resolved.type) {
    case "TEST":
      return {
        type: "TEST",
        topicId,
        questionCount: resolved.questionCount,
        kinds: [...resolved.kinds],
        difficulty: resolved.difficulty,
      };
    case "SLIDES":
      return { type: "SLIDES", topicId, slideCount: resolved.slideCount };
    case "GAME":
      return {
        type: "GAME",
        topicId,
        gameKind: resolved.gameKind,
        itemCount: resolved.itemCount,
      };
    case "LESSON_PLAN":
      return { type: "LESSON_PLAN", topicId, durationMinutes: resolved.durationMinutes };
  }
}

/* ------------------------------------------------------------------ */
/* URL qurish                                                          */
/* ------------------------------------------------------------------ */

/**
 * Joriy holatdan `<Link href={{ query }}>` uchun query quradi.
 *
 * `overrides` — URL parametr nomlari bo'yicha; `null` kalitni O'CHIRADI
 * (masalan chorak filtrini tozalash).
 */
export function wizardQuery(
  params: WizardParams,
  overrides: WizardOverrides = {},
): Record<string, string> {
  const base: Record<WizardParamName, QueryValue> = {
    qadam: params.step,
    tur: params.type,
    fan: params.subject,
    sinf: params.grade,
    chorak: params.quarter,
    mavzu: params.topicId,
    q: params.query,
    daqiqa: params.duration,
    savol: params.questionCount,
    turlar: params.kinds,
    qiyin: params.difficulty,
    slayd: params.slideCount,
    oyin: params.gameKind === null ? null : paramForGameKind(params.gameKind),
    element: params.itemCount,
  };
  return buildQuery({ ...base, ...overrides });
}

/**
 * Parametr qadamidagi "Davom etish" havolasi uchun query.
 *
 * Hal qilingan (default'li) qiymatlarni URL'ga YOZADI — shundan keyin
 * `paramsCompleteForType` rost bo'ladi va `inferStep` tasdiqlash qadamiga
 * o'tadi. Ya'ni "hech narsaga tegmasdan davom etish" ham aniq tanlov
 * sifatida qayd etiladi va ulashilgan havolada saqlanadi.
 */
export function confirmQuery(params: WizardParams): Record<string, string> {
  const resolved = resolveParams(params);

  // Har tarmoq BOSHQA turning parametrlarini `null` qiladi: ulashilgan
  // havolada eski tanlov qolib ketsa, `parseWizardParams` uni qaytib o'qib
  // qadamni noto'g'ri hisoblardi.
  switch (resolved.type) {
    case "TEST":
      return wizardQuery(params, {
        qadam: "tasdiq",
        savol: resolved.questionCount,
        turlar: resolved.kinds,
        qiyin: resolved.difficulty,
        daqiqa: null,
        slayd: null,
        oyin: null,
        element: null,
      });
    case "SLIDES":
      return wizardQuery(params, {
        qadam: "tasdiq",
        slayd: resolved.slideCount,
        daqiqa: null,
        savol: null,
        turlar: null,
        qiyin: null,
        oyin: null,
        element: null,
      });
    case "GAME":
      return wizardQuery(params, {
        qadam: "tasdiq",
        oyin: paramForGameKind(resolved.gameKind),
        element: resolved.itemCount,
        daqiqa: null,
        savol: null,
        turlar: null,
        qiyin: null,
        slayd: null,
      });
    case "LESSON_PLAN":
      return wizardQuery(params, {
        qadam: "tasdiq",
        daqiqa: resolved.durationMinutes,
        savol: null,
        turlar: null,
        qiyin: null,
        slayd: null,
        oyin: null,
        element: null,
      });
  }
}

/**
 * Savol turini qo'shadi yoki olib tashlaydi.
 *
 * Bo'sh to'plam QAYTARMAYDI: oxirgi turni olib tashlashga urinish holatni
 * o'zgartirmaydi. Sabab `startSchema` dagi `.min(1)` — bo'sh ro'yxat bilan
 * yuborilgan forma `"invalid"` qaytarardi va o'qituvchi nega ekanini
 * tushunmasdi.
 */
export function toggleKind(
  current: readonly QuestionKind[] | null,
  kind: QuestionKind,
): QuestionKind[] {
  const base = current ?? DEFAULT_KINDS;
  if (base.includes(kind)) {
    if (base.length === 1) return [...base];
    return QUESTION_KINDS.filter((item) => item !== kind && base.includes(item));
  }
  return QUESTION_KINDS.filter((item) => item === kind || base.includes(item));
}

/* ------------------------------------------------------------------ */
/* Yiqilgan hujjatdan qayta urinish                                    */
/* ------------------------------------------------------------------ */

/**
 * `inputParams` ni HIMOYALANGAN holda o'qiydi.
 *
 * `run-stage.ts` bu obyektni `.parse` bilan o'qiydi (nomuvofiqlik =
 * dasturchi xatosi), bu yerda esa `safeParse`: qayta urinish havolasi
 * buzuq hujjatda ham ishlashi kerak — eng yomoni, o'qituvchi parametrlarni
 * qaytadan tanlaydi.
 */
const RetryParams = z.object({
  durationMinutes: z.number().int().optional(),
  questionCount: z.number().int().optional(),
  kinds: z.array(z.enum(QUESTION_KINDS)).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  slideCount: z.number().int().optional(),
  gameKind: z.enum(GAME_KINDS).optional(),
  itemCount: z.number().int().optional(),
});

/**
 * Yiqilgan hujjatdan "Qaytadan yaratish" havolasining query'si.
 *
 * NEGA YANGI SERVER ACTION YO'Q: `FAILED` bo'lganda kredit ALLAQACHON
 * qaytarilgan (`release()`), ya'ni hujjatni qayta navbatga qo'yadigan amal
 * baribir kreditni qaytadan `hold` qilishi kerak — oddiy yaratish oqimi
 * qiladigan ishning aynan o'zi. Natijada ikkita kredit-hold yo'li paydo
 * bo'lardi, ikki marta hold yoki hold'siz generatsiya kabi xatolar esa
 * aynan shu yerdan chiqadi. Shuning uchun tugma sehrgarni TO'LDIRILGAN
 * holda ochadi va yangi hujjat oddiy yo'ldan o'tadi.
 *
 * `fan`/`sinf` BERILMAYDI — hujjatda ular yo'q. Shu sababdan `inferStep`
 * ularni talab qilmaydi (yuqoridagi izohga qarang).
 */
export function wizardQueryFromDocument(doc: {
  type: SupportedDocumentType;
  topicId: string;
  inputParams: unknown;
}): Record<string, string> {
  const parsed = RetryParams.safeParse(doc.inputParams);
  const saved = parsed.success ? parsed.data : {};

  const base: Record<WizardParamName, QueryValue> = {
    qadam: "tasdiq",
    tur: typeParamFor(doc.type),
    fan: null,
    sinf: null,
    chorak: null,
    mavzu: doc.topicId,
    q: null,
    daqiqa: null,
    savol: null,
    turlar: null,
    qiyin: null,
    slayd: null,
    oyin: null,
    element: null,
  };

  switch (doc.type) {
    case "TEST":
      // Variant ro'yxatida bo'lmagan son tashlanadi — `parseWizardParams`
      // uni baribir rad etardi, va u holda qadam `param` ga tushadi.
      base.savol =
        saved.questionCount !== undefined &&
        QUESTION_COUNTS.includes(saved.questionCount)
          ? saved.questionCount
          : null;
      base.turlar = saved.kinds ?? null;
      base.qiyin = saved.difficulty ?? null;
      break;
    case "SLIDES":
      base.slayd =
        saved.slideCount !== undefined && SLIDE_COUNTS.includes(saved.slideCount)
          ? saved.slideCount
          : null;
      break;
    case "GAME":
      base.oyin = saved.gameKind === undefined ? null : paramForGameKind(saved.gameKind);
      // Chegaradan tashqari son tashlanadi — `parseWizardParams` uni
      // baribir rad etardi va qadam `param` ga tushardi.
      base.element =
        saved.gameKind !== undefined &&
        saved.itemCount !== undefined &&
        itemCountAllowed(saved.gameKind, saved.itemCount)
          ? saved.itemCount
          : null;
      break;
    case "LESSON_PLAN":
      base.daqiqa =
        saved.durationMinutes !== undefined &&
        DURATIONS.includes(saved.durationMinutes)
          ? saved.durationMinutes
          : null;
      break;
  }

  return buildQuery(base);
}
