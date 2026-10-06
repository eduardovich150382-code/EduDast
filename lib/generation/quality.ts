import type { BlockType, DocumentContent } from "@/lib/documents/blocks";
import { renderDocument } from "@/lib/documents/render";
import { gameItemCount } from "@/lib/games/content";
import type { GameKind } from "@/lib/games/types";
import { buildWordSearch } from "@/lib/games/word-search";
import type { BloomTargets } from "./plans-test";

/**
 * AI'SIZ sifat bahosi.
 *
 * SOF FUNKSIYA: bazaga bormaydi, tarmoqqa chiqmaydi, vaqtga bog'liq emas
 * (`lib/credits/cost-table.ts` naqshi). Sabab: hujjatni baholash uchun
 * ikkinchi LLM chaqirish narxni ikki barobar oshirardi va "baholovchi ham
 * xato qiladi" muammosini qo'shardi.
 *
 * IKKI QATLAM:
 *   1. VETO — `severity: "error"` izohlaridan biri chiqsa, ball
 *      `ERROR_CEILING` dan oshmaydi, ya'ni hujjat `SCORE_FAIL` dan past
 *      tushadi va kredit qaytariladi. Qaysi qoida veto berishi pastdagi
 *      `RULES` jadvalida, BITTA joyda.
 *   2. OG'IRLANGAN BALL — vetodan o'tgan hujjatlarni o'zaro saralaydi.
 *
 * NEGA VETO KERAK BO'LDI: ilgari ball sof og'irlangan o'rtacha edi. Bitta
 * o'lcham noldan boshlansa ham ball 0.6 dan pastga tushmasdi, ya'ni
 * `SCORE_FAIL` darvozasi amalda HECH QACHON ishlamasdi — ikkala jonli
 * yugurishda ham aniq 1.0 chiqqani shundan.
 *
 * Ball `Document.qualityScore` ga, to'liq hisobot (har komponentning xom
 * bali, vazni va ishlagan qoidalar) `Document.qualityNotes` ga yoziladi —
 * `DONE` hujjatlarda ham, keyin real trafikda FAILED ulushini ko'rish uchun.
 */

/** Shu balldan past — hujjat yaroqsiz: `FAILED` + kredit qaytariladi. */
export const SCORE_FAIL = 0.5;

/** Shu balldan past, lekin `SCORE_FAIL` dan yuqori — `DONE` + ogohlantirish. */
export const SCORE_WARN = 0.7;

/**
 * Veto shifti — QAT'IY qiymat emas, `Math.min` bilan qo'llanadigan SHIFT.
 *
 * Yiqilgan hujjatlar shu tufayli o'zaro saralanib turadi: butunlay bo'sh
 * hujjat 0.0 oladi, faqat daqiqasi buzilgani 0.45. Admin panelida "eng
 * yomonlari" ro'yxati shunga tayanadi.
 */
export const ERROR_CEILING = 0.45;

/** Daqiqa yig'indisining chetlanishi: shundan yuqorisi ogohlantirish. */
const MINUTES_WARN = 0.1;

/**
 * Daqiqa chetlanishining VETO chegarasi.
 *
 * NEGA 25 %, 10 % EMAS: 10 % veto uchun juda tor. 45 daqiqalik darsda
 * 40 daqiqa (11 %) — o'qituvchi bir bosqichga 5 daqiqa qo'shib ishlatadigan
 * hujjat, uni bekor qilib kreditni qaytarish noto'g'ri. 45 daqiqaga 25
 * daqiqa esa boshqa dars.
 */
const MINUTES_ERROR = 0.25;

/** Kirill belgilar ulushining shifti (lotin so'ralganda). */
const CYRILLIC_LIMIT = 0.02;

/**
 * Kalit so'z prefiksining uzunligi.
 *
 * O'zbek tili AGGLUTINATIV: "tezlanish", "tezlanishni", "tezlanishga",
 * "tezlanishdan", "tezlanishlar" — bitta so'z. Aynan solishtirish mazmunan
 * to'liq hujjatga 0 ball berardi. Shuning uchun taqqoslash prefiks bo'yicha.
 *
 * 6 — muvozanat: qisqaroq bo'lsa turli so'zlar qo'shilib ketadi ("tezlik" va
 * "tezlanish" ikkalasi ham "tezli..."), uzunroq bo'lsa qo'shimchalar yana
 * kesilmay qoladi.
 */
const PREFIX_LEN = 6;

/** Prefiks kesish MA'NOSIZ bo'ladigan qisqa so'zlar — to'liq solishtiriladi. */
const MIN_TERM_LEN = 4;

/**
 * Qamrov hisobiga kirmaydigan umumiy so'zlar. Ular deyarli har matnda bor,
 * ya'ni qamrovni soxta ko'taradi.
 */
const STOPWORDS = new Set([
  "uchun",
  "bilan",
  "haqida",
  "hamda",
  "yoki",
  "ammo",
  "lekin",
  "shuningdek",
  "o'quvchi",
  "o'quvchilar",
  "o'qituvchi",
  "dars",
  "mavzu",
  "bo'yicha",
  "kerak",
  "mumkin",
  "qanday",
  "nima",
]);

/* ------------------------------------------------------------------ */
/* VETO JADVALI                                                        */
/* ------------------------------------------------------------------ */

/**
 * Har qoida uchun savol BITTA: "O'QITUVCHI BUNI SINFDA ISHLATA OLADIMI?"
 *
 *   - "Yo'q" -> `error`. Ball shiftga qadaladi, hujjat FAILED bo'ladi,
 *     kredit qaytariladi. Bu PUL QARORI.
 *   - "Ha, lekin biroz tahrirlashi kerak" -> `warn`. Ball pasayadi, hujjat
 *     o'qituvchiga ogohlantirish bilan yetib boradi.
 *
 * Jadval ataylab shu yerda, tekshiruv kodidan AJRATILGAN: qoidaning narxi
 * uni yozgan `if` ning yonida ko'rinmasdi.
 */
type RuleId =
  | "missing_block"
  | "missing_answer_key"
  | "mcq_invalid"
  | "minutes_missing"
  | "minutes_error"
  | "minutes_warn"
  | "coverage_missing"
  | "lang_cyrillic"
  | "md_artifact"
  | "length_short"
  // 10-sessiya — `TEST` turiga xos qoidalar.
  | "question_count"
  | "answer_key_conflict"
  | "match_invalid"
  | "mcq_tell"
  | "mcq_duplicate_option"
  | "truefalse_skew"
  | "bloom_drift"
  // 14-sessiya — `SLIDES` turiga xos qoidalar.
  | "slide_count"
  | "slide_bullets"
  | "slide_bullet_long"
  | "slide_layout_title"
  // 15-sessiya — `GAME` turiga xos qoidalar.
  | "game_item_count"
  | "game_clue_short"
  | "game_words_unplaced";

export type Severity = "error" | "warn";

export const RULES: Record<RuleId, { severity: Severity; why: string }> = {
  /** Sarlavhasiz yoki uy vazifasisiz ishlanma — chala hujjat. */
  missing_block: { severity: "error", why: "Majburiy bo'lim yo'q — hujjat chala." },
  /** Javobi yo'q test — o'qituvchi uni tekshira olmaydi. */
  missing_answer_key: { severity: "error", why: "Savol bor, javob kaliti yo'q." },
  /** Variantlar orasida to'g'ri javob yo'q — savol yaroqsiz. */
  mcq_invalid: { severity: "error", why: "Test varianti qoidaga mos emas." },
  /** Bosqichsiz ishlanma bilan darsga kirib bo'lmaydi. */
  minutes_missing: { severity: "error", why: "Dars bosqichlari umuman yo'q." },
  /** Boshqa uzunlikdagi darsga yozilgan reja — qayta yozish kerak. */
  minutes_error: { severity: "error", why: `Daqiqa chetlanishi ${String(MINUTES_ERROR * 100)} % dan katta.` },
  /** Bir bosqichga bir necha daqiqa qo'shib ishlatish mumkin. */
  minutes_warn: { severity: "warn", why: "Daqiqa yig'indisi biroz qochgan." },
  /**
   * `warn`, `error` EMAS: qamrov PREFIKS-STEMMING ga tayanadigan taxminiy
   * o'lcham. Sinonim yoki boshqa yasalish shakli ishlatilgan to'g'ri hujjat
   * ham "atama yo'q" deb belgilanishi mumkin — taxminiy o'lcham pul
   * to'langan hujjatni yiqitmasligi kerak.
   */
  coverage_missing: { severity: "warn", why: "Kurikulum atamalari matnda uchramadi." },
  /** Lotin so'ralganda rus/kirill matn — o'qituvchi buni bera olmaydi. */
  lang_cyrillic: { severity: "error", why: "Lotin so'ralgan, matnda kirill." },
  /** `**qalin**` chop etishda ko'rinadi, lekin qo'lda tozalasa bo'ladi. */
  md_artifact: { severity: "warn", why: "Markdown belgisi tozalanmagan." },
  /** Qisqa bandlarni o'qituvchi o'zi to'ldirib ishlatadi. */
  length_short: { severity: "warn", why: "Bandlar juda qisqa." },

  /**
   * Kredit AYNAN savol soniga qarab yechiladi
   * (`lib/credits/cost-table.ts`). 20 savol uchun to'lab 12 ta olish — pul
   * masalasi, shuning uchun `error`.
   */
  question_count: { severity: "error", why: "Savol soni so'ralganiga teng emas." },
  /** Bir savolga ikki xil javob — o'qituvchi qaysi biri to'g'ri ekanini bilmaydi. */
  answer_key_conflict: { severity: "error", why: "Javoblar kaliti ziddiyatli." },
  /** Juftliklari buzilgan moslashtirish savolini berib bo'lmaydi. */
  match_invalid: { severity: "error", why: "Moslashtirish juftliklari qoidaga mos emas." },
  /**
   * `warn`, `error` EMAS: o'qituvchi uzun variantni qisqartirib ishlatadi.
   * Lekin ball pasayadi — "uzun variant = to'g'ri javob" testning o'lchash
   * qobiliyatini yo'q qiladi.
   */
  mcq_tell: { severity: "warn", why: "To'g'ri javob variantlardan sezilarli uzun." },
  /** Takrorlangan variant o'lik tanlov, lekin savol baribir ishlaydi. */
  mcq_duplicate_option: { severity: "warn", why: "Variantlar ichida takror bor." },
  /** Taxmin bilan o'tish osonlashadi, lekin test yaroqli qoladi. */
  truefalse_skew: { severity: "warn", why: "To'g'ri/noto'g'ri nisbati muvozanatsiz." },
  /**
   * `warn`: taqsimot TAXMINIY o'lcham. Model savolni blueprint'dagidan
   * bir daraja yuqori yozgani uchun pul qaytarish haddan ziyod.
   */
  bloom_drift: { severity: "warn", why: "Bloom taqsimoti blueprint'dan chetlashgan." },

  /**
   * Kredit AYNAN slayd soniga qarab yechiladi
   * (`lib/credits/cost-table.ts`) — `question_count` bilan ayni mantiq:
   * 14 slaydga to'lab 9 ta olish pul masalasi, shuning uchun `error`.
   */
  slide_count: { severity: "error", why: "Slayd soni so'ralganiga teng emas." },
  /** O'qituvchi ortiqcha punktni o'zi o'chiradi, taqdimot ishlab turadi. */
  slide_bullets: { severity: "warn", why: "Slaydda 6 tadan ko'p punkt." },
  /** Orqa partadan o'qilmaydi, lekin matnni qisqartirish bir daqiqalik ish. */
  slide_bullet_long: { severity: "warn", why: "Punkt proyektorda o'qish uchun uzun." },
  /** Taqdimot o'rtasidagi bosh slayd xatoga o'xshaydi, halokat emas. */
  slide_layout_title: { severity: "warn", why: "Bosh slayd ko'rinishi birinchi slaydda emas." },
  /**
   * 14 so'zga to'lab 11 ta olish — slayd soni bilan ayni pul masalasi,
   * shuning uchun `error`.
   */
  game_item_count: { severity: "error", why: "O'yin elementlari soni so'ralganiga teng emas." },
  /** Qisqa ta'rifli so'zni o'qituvchi o'zi to'ldiradi, o'yin ishlab turadi. */
  game_clue_short: { severity: "warn", why: "Anagramma ta'rifi juda qisqa." },
  /**
   * Ro'yxatda bor, lekin panjarada yo'q so'z — topilmaydigan topshiriq.
   *
   * `error`: bola yo'q so'zni izlab vaqt yo'qotadi va o'yin "buzilgan"
   * bo'lib ko'rinadi. `buildWordSearch` panjarani to'rt marta qayta quradi,
   * ya'ni bu holat AMALDA YUZAGA CHIQMAYDI — qoida "yuz berdi" signali.
   */
  game_words_unplaced: { severity: "error", why: "So'z panjaraga joylashmagan." },
};

export type QualityNote = {
  /** Barqaror kalit — admin panelida guruhlash uchun (erkin matn emas). */
  code: string;
  /** `RULES` jadvalidagi qoida — ball qarori shundan kelib chiqadi. */
  rule: RuleId;
  severity: Severity;
  message: string;
};

export type ComponentName = "structure" | "coverage" | "language" | "length";

export type ComponentScore = {
  /** O'lchamning O'Z bali, 0..1. Hisobga kirmasa 0. */
  raw: number;
  /** Jadvaldagi asl vazn. */
  baseWeight: number;
  /** Qayta normallashtirilgandan KEYINGI amaldagi vazn. */
  weight: number;
  applied: boolean;
  /** `applied: false` bo'lsa — nega chiqarilgani. */
  skipReason?: string;
};

export type QualityReport = {
  /** Yakuniy ball (veto shiftidan KEYIN) — `Document.qualityScore`. */
  score: number;
  /** Veto shiftidan OLDINGI og'irlangan ball — diagnostika uchun. */
  weighted: number;
  /** Ball `ERROR_CEILING` ga qadalganmi. */
  cappedByError: boolean;
  components: Record<ComponentName, ComponentScore>;
  notes: QualityNote[];
};

/**
 * O'lchamlarning vazni.
 *
 * `structure` eng og'ir: daqiqalari to'g'ri kelmagan ishlanmani o'qituvchi
 * sinfda ishlata olmaydi. `language` ham yuqori — kirill yoki markdown
 * aralashgan matn to'g'ridan-to'g'ri ko'zga tashlanadi.
 *
 * Bir o'lcham hisobga kirmasa (masalan kurikulumda kalit so'z yo'q), uning
 * vazni QOLGANLARIGA qayta taqsimlanadi — pastdagi `aggregate` ga qarang.
 */
const WEIGHTS: Record<ComponentName, number> = {
  structure: 0.4,
  coverage: 0.25,
  language: 0.25,
  length: 0.1,
};

/**
 * O'lcham natijasi.
 *
 * `skip` — "bu hujjatda o'lchaydigan narsa yo'q". Ilgari bunday hollarda
 * `1` qaytarilardi, ya'ni o'lcham BALL TO'QIB berardi: kurikulumi bo'sh
 * mavzuda qamrov tekin 0.25 olardi.
 */
type Measure = { raw: number } | { skip: string };

/* ------------------------------------------------------------------ */
/* Matn normallashtirish                                               */
/* ------------------------------------------------------------------ */

/**
 * O'zbek lotinidagi apostrof variantlarini bittaga keltiradi.
 *
 * `o'`, `o‘`, `oʻ`, `o’` — foydalanuvchi, CSV va LLM uch xil belgi
 * ishlatadi. Normallashtirilmasa "o'quvchi" va "oʻquvchi" boshqa so'z
 * bo'lib qoladi va qamrov hisobi jimgina nolga tushadi.
 */
function normalizeWord(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'");
}

/** Matnni so'zlarga ajratadi. Apostrof so'z ICHIDA qoladi. */
function words(text: string): string[] {
  return normalizeWord(text)
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 0);
}

/** Prefiks — qisqa so'z to'liq qoladi. */
function stem(word: string): string {
  return word.length <= PREFIX_LEN ? word : word.slice(0, PREFIX_LEN);
}

/** Izohni `RULES` jadvalidagi darajasi bilan qo'shadi. */
function note(notes: QualityNote[], rule: RuleId, code: string, message: string): void {
  notes.push({ code, rule, severity: RULES[rule].severity, message });
}

/* ------------------------------------------------------------------ */
/* O'lchamlar                                                          */
/* ------------------------------------------------------------------ */

/**
 * Hujjat turiga xos baho parametrlari.
 *
 * `durationMinutes` ni to'g'ridan-to'g'ri olish o'rniga diskriminatsiyalangan
 * union: test uchun dars davomiyligi MA'NOSIZ, savol soni esa majburiy.
 * Ikkisini bitta ixtiyoriy maydonga siqish "test uchun daqiqa tekshirilmay
 * qolgan" turidagi jim xatoning yo'li edi.
 */
export type ScoreSpec =
  | { type: "LESSON_PLAN"; durationMinutes: number }
  | { type: "TEST"; questionCount: number; bloomTargets: BloomTargets }
  | { type: "SLIDES"; slideCount: number }
  | { type: "GAME"; gameKind: GameKind; itemCount: number };

/**
 * Sxema KAFOLATLAGAN bloklar.
 *
 * Ular BALLGA KIRMAYDI, faqat veto izohi beradi. Sabab: bu bloklarni
 * `lib/generation/plans.ts` dagi `stage1Blocks`/`stage2Blocks`/`stage3Blocks`
 * har doim qo'yadi, ya'ni ular uchun ball berish "biz yozgan kodni biz
 * tekshirdik" degani — ball to'qib beradi, xolos. Tekshiruv baribir qoladi:
 * bosqichlardan biri commit bo'lmay hujjat chala qolgan holat veto bilan
 * ushlanadi.
 */
const LESSON_BLOCKS = [
  "heading",
  "objectives",
  "materials",
  "stages",
  "homework",
] as const satisfies readonly BlockType[];

/** Testning majburiy bloklari — yuqoridagi izoh bunga ham tegishli. */
const TEST_BLOCKS = [
  "heading",
  "objectives",
  "question",
  "answerKey",
  "rubric",
] as const satisfies readonly BlockType[];

/**
 * Taqdimotning majburiy bloklari.
 *
 * Qisqa ro'yxat: `slidesOutlineBlocks` sarlavha qo'yadi, `slideBlocks` esa
 * slaydlarni. Ikkisidan biri yo'q bo'lsa bosqich commit bo'lmagan — aynan
 * veto ushlaydigan holat.
 */
const SLIDES_BLOCKS = ["heading", "slide"] as const satisfies readonly BlockType[];

/**
 * O'yinning majburiy bloklari.
 *
 * `plans-game.ts` sarlavha va BITTA `game` blokini yozadi. Ikkisidan biri
 * yo'q bo'lsa bosqich commit bo'lmagan — aynan veto ushlaydigan holat.
 */
const GAME_BLOCKS = ["heading", "game"] as const satisfies readonly BlockType[];

function requireBlocks(
  present: ReadonlySet<BlockType>,
  required: readonly BlockType[],
  notes: QualityNote[],
): void {
  for (const type of required) {
    if (!present.has(type)) {
      note(notes, "missing_block", `missing_block:${type}`, `Majburiy blok yo'q: ${type}`);
    }
  }
}

/**
 * Turga qarab tarmoqlanadi — tana `measure*Structure` larda.
 *
 * `default` TARMOG'I ATAYLAB YO'Q: `ScoreSpec` ga to'rtinchi tur qo'shilsa
 * TypeScript aynan shu yerda yiqiladi va yangi tur jimgina dars ishlanma
 * qoidalari bilan baholanib ketmaydi.
 */
function measureStructure(
  content: DocumentContent,
  spec: ScoreSpec,
  notes: QualityNote[],
): Measure {
  switch (spec.type) {
    case "TEST":
      return measureTestStructure(content, spec, notes);
    case "SLIDES":
      return measureSlidesStructure(content, spec, notes);
    case "GAME":
      return measureGameStructure(content, spec, notes);
    case "LESSON_PLAN":
      return measureLessonStructure(content, spec.durationMinutes, notes);
  }
}

function measureLessonStructure(
  content: DocumentContent,
  durationMinutes: number,
  notes: QualityNote[],
): Measure {
  const present = new Set(content.blocks.map((block) => block.type));
  requireBlocks(present, LESSON_BLOCKS, notes);

  let points = 0;
  let total = 0;

  // Daqiqa yig'indisi — o'lchamning O'ZAGI.
  total += 2;
  const stageBlocks = content.blocks.filter((block) => block.type === "stages");
  if (stageBlocks.length === 0) {
    note(
      notes,
      "minutes_missing",
      "minutes:no_stages",
      "Dars bosqichlari yo'q, daqiqa yig'indisi tekshirilmadi",
    );
  } else {
    const minutes = stageBlocks.reduce(
      (sum, block) => sum + block.items.reduce((inner, stage) => inner + stage.minutes, 0),
      0,
    );
    const drift = Math.abs(minutes - durationMinutes) / durationMinutes;
    const detail = `Bosqich daqiqalari ${String(minutes)}, so'ralgani ${String(durationMinutes)}`;

    if (drift <= MINUTES_WARN) {
      points += 2;
    } else if (drift <= MINUTES_ERROR) {
      // Yarim ball: o'qituvchi bir bosqichga daqiqa qo'shib ishlata oladi.
      points += 1;
      note(notes, "minutes_warn", "minutes:soft_drift", detail);
    } else {
      note(notes, "minutes_error", "minutes:drift", detail);
    }
  }

  // Savollar bo'lsa — javob kaliti va mcq qoidalari. Savol yo'q bo'lsa bu
  // o'lchamlar hisobga KIRMAYDI (dars ishlanmada savol majburiy emas).
  const questions = content.blocks.filter((block) => block.type === "question");
  if (questions.length > 0) {
    total += 1;
    if (present.has("answerKey")) {
      points += 1;
    } else {
      note(
        notes,
        "missing_answer_key",
        "missing_block:answerKey",
        "Savollar bor, lekin javoblar kaliti yo'q",
      );
    }

    total += 1;
    const broken = questions.filter(
      (question) =>
        question.kind === "mcq" &&
        (new Set(question.options).size < 3 || !question.options.includes(question.answer)),
    );
    if (broken.length === 0) {
      points += 1;
    } else {
      note(
        notes,
        "mcq_invalid",
        "mcq:invalid",
        `${String(broken.length)} ta test savoli variant qoidasiga mos emas`,
      );
    }
  }

  return { raw: points / total };
}

/* ------------------------------------------------------------------ */
/* Test strukturasi (10-sessiya)                                       */
/* ------------------------------------------------------------------ */

/**
 * To'g'ri/noto'g'ri tasdiqlar nisbatining ruxsat etilgan oynasi.
 *
 * NEGA 30-70 %, 50 % EMAS: aniq yarmini talab qilish model uchun sun'iy
 * shart, va 7 savolda uni bajarish mumkin ham emas. Oyna esa "hammasi
 * to'g'ri" turidagi haqiqiy nuqsonni ushlaydi.
 */
const TRUEFALSE_MIN_RATIO = 0.3;
const TRUEFALSE_MAX_RATIO = 0.7;

/**
 * Nisbat o'lchanadigan eng kam savol soni.
 *
 * Ikki savolda nisbat 0, 0.5 yoki 1 bo'ladi — ya'ni oynaga tushishi
 * tasodifga bog'liq. Shundan kam bo'lsa tekshiruv UMUMAN o'tkazilmaydi.
 */
const TRUEFALSE_MIN_COUNT = 3;

/**
 * To'g'ri javob qolgan variantlarning o'rtachasidan shuncha barobar uzun
 * bo'lsa — "uzun variant = to'g'ri javob" belgisi.
 *
 * 1.6 ataylab keng: to'g'ri javob tabiiy ravishda biroz uzunroq bo'lishi
 * mumkin (birlik, aniqlik), 1.6 barobar esa allaqachon naqsh.
 */
const MCQ_TELL_FACTOR = 1.6;

/** Bloom taqsimotining ruxsat etilgan chetlanishi (savol soni bo'yicha). */
const BLOOM_TOLERANCE = 1;

/** `truefalse` javobining kanonik shakllari (apostrof normallashtirilgan). */
const TRUE_ANSWER = "to'g'ri";
const FALSE_ANSWER = "noto'g'ri";

type Part = { points: number; total: number };

type QuestionBlock = Extract<DocumentContent["blocks"][number], { type: "question" }>;
type AnswerKeyItem = Extract<
  DocumentContent["blocks"][number],
  { type: "answerKey" }
>["items"][number];

/**
 * Javoblar kalitining to'liqligi.
 *
 * BARCHA `answerKey` bloklari birlashtirib qaraladi: 20 tadan ko'p savolli
 * test `2a`/`2b` bosqichlariga bo'linadi va har biri O'Z kalit blokini
 * yozadi (`plans-test.ts`). Faqat birinchisiga qarash testning yarmini
 * "kalitsiz" deb yiqitardi.
 */
function checkAnswerKey(
  questions: QuestionBlock[],
  items: AnswerKeyItem[],
  notes: QualityNote[],
): Part {
  const ids = new Set(questions.map((question) => question.id));
  const byQuestion = new Map<string, Set<string>>();
  const unknown: string[] = [];

  for (const item of items) {
    if (!ids.has(item.questionId)) {
      unknown.push(item.questionId);
      continue;
    }
    const answers = byQuestion.get(item.questionId) ?? new Set<string>();
    answers.add(normalizeWord(item.answer));
    byQuestion.set(item.questionId, answers);
  }

  const missing = questions.filter((question) => !byQuestion.has(question.id));
  if (missing.length > 0) {
    // Kod `missing_block:answerKey` EMAS: blokning butunlay yo'qligini
    // `requireBlocks` allaqachon o'sha kod bilan belgilaydi, ikkisi
    // to'qnashsa admin panelida guruhlash chalkashardi.
    note(
      notes,
      "missing_answer_key",
      "answer_key:missing",
      `${String(missing.length)} savolning javobi kalitda yo'q`,
    );
    return { points: 0, total: 2 };
  }

  const conflicting = [...byQuestion.values()].filter((answers) => answers.size > 1).length;
  if (conflicting > 0 || unknown.length > 0) {
    note(
      notes,
      "answer_key_conflict",
      "answer_key:conflict",
      `Kalitda ${String(conflicting)} ta ziddiyatli javob, ${String(unknown.length)} ta noma'lum savol havolasi`,
    );
    return { points: 1, total: 2 };
  }

  return { points: 2, total: 2 };
}

/** Variantli savollarning qoidalari — sxema kafolatlamagan qismi. */
function checkMcq(questions: QuestionBlock[], notes: QualityNote[]): Part {
  const mcq = questions.filter((question) => question.kind === "mcq");
  if (mcq.length === 0) return { points: 0, total: 0 };

  let points = 2;

  const invalid = mcq.filter((question) => !question.options.includes(question.answer));
  if (invalid.length > 0) {
    note(
      notes,
      "mcq_invalid",
      "mcq:invalid",
      `${String(invalid.length)} ta savolning to'g'ri javobi variantlar ichida yo'q`,
    );
    points -= 1;
  }

  const duplicated = mcq.filter((question) => {
    const seen = new Set(question.options.map(normalizeWord));
    return seen.size !== question.options.length;
  });
  if (duplicated.length > 0) {
    note(
      notes,
      "mcq_duplicate_option",
      "mcq:duplicate_option",
      `${String(duplicated.length)} ta savolda takrorlangan variant bor`,
    );
    points -= 1;
  }

  const telling = mcq.filter((question) => {
    const others = question.options.filter((option) => option !== question.answer);
    if (others.length < 2) return false;
    const average = others.reduce((sum, option) => sum + option.length, 0) / others.length;
    return average > 0 && question.answer.length > average * MCQ_TELL_FACTOR;
  });
  if (telling.length > 0) {
    note(
      notes,
      "mcq_tell",
      "mcq:tell",
      `${String(telling.length)} ta savolda to'g'ri javob qolgan variantlardan sezilarli uzun`,
    );
    points -= 1;
  }

  return { points: Math.max(0, points), total: 2 };
}

/** To'g'ri va noto'g'ri tasdiqlar muvozanati. */
function checkTrueFalse(questions: QuestionBlock[], notes: QualityNote[]): Part {
  const items = questions.filter((question) => question.kind === "truefalse");
  if (items.length < TRUEFALSE_MIN_COUNT) return { points: 0, total: 0 };

  const positive = items.filter(
    (question) => normalizeWord(question.answer) === TRUE_ANSWER,
  ).length;
  const recognized = items.filter((question) => {
    const answer = normalizeWord(question.answer);
    return answer === TRUE_ANSWER || answer === FALSE_ANSWER;
  }).length;

  // Kanonik bo'lmagan javob ("ha", "rost") nisbatni hisoblashni ma'nosiz
  // qiladi — bu `truefalse` qoidasining buzilishi, shuning uchun belgi.
  if (recognized !== items.length) {
    note(
      notes,
      "truefalse_skew",
      "truefalse:unrecognized",
      `${String(items.length - recognized)} ta tasdiqning javobi "to'g'ri"/"noto'g'ri" shaklida emas`,
    );
    return { points: 0, total: 1 };
  }

  const ratio = positive / items.length;
  if (ratio < TRUEFALSE_MIN_RATIO || ratio > TRUEFALSE_MAX_RATIO) {
    note(
      notes,
      "truefalse_skew",
      "truefalse:skew",
      `${String(items.length)} tasdiqdan ${String(positive)} tasi "to'g'ri" (${(ratio * 100).toFixed(0)} %)`,
    );
    return { points: 0, total: 1 };
  }

  return { points: 1, total: 1 };
}

/** Moslashtirish juftliklari: ikki ustun ham to'la va takrorsiz. */
function checkMatch(questions: QuestionBlock[], notes: QualityNote[]): Part {
  const items = questions.filter((question) => question.kind === "match");
  if (items.length === 0) return { points: 0, total: 0 };

  const broken = items.filter((question) => {
    const pairs = question.pairs ?? [];
    if (pairs.length < 2) return true;
    const left = new Set(pairs.map((pair) => normalizeWord(pair.left)));
    const right = new Set(pairs.map((pair) => normalizeWord(pair.right)));
    return left.size !== pairs.length || right.size !== pairs.length;
  });

  if (broken.length > 0) {
    note(
      notes,
      "match_invalid",
      "match:invalid",
      `${String(broken.length)} ta moslashtirish savolining juftliklari buzuq`,
    );
    return { points: 0, total: 1 };
  }

  return { points: 1, total: 1 };
}

/** Bloom taqsimoti blueprint'ga mosmi (±1 savol). */
function checkBloom(
  questions: QuestionBlock[],
  targets: BloomTargets,
  notes: QualityNote[],
): Part {
  const levels = Object.keys(targets);
  if (levels.length === 0) return { points: 0, total: 0 };

  const actual = new Map<string, number>();
  for (const question of questions) {
    actual.set(question.bloom, (actual.get(question.bloom) ?? 0) + 1);
  }

  const drifted: string[] = [];
  for (const level of new Set([...levels, ...actual.keys()])) {
    const want = targets[level as keyof BloomTargets] ?? 0;
    const have = actual.get(level) ?? 0;
    if (Math.abs(have - want) > BLOOM_TOLERANCE) {
      drifted.push(`${level}: ${String(have)}/${String(want)}`);
    }
  }

  if (drifted.length > 0) {
    note(notes, "bloom_drift", "bloom:drift", `Bloom taqsimoti chetlashgan — ${drifted.join(", ")}`);
    return { points: 0, total: 1 };
  }

  return { points: 1, total: 1 };
}

function measureTestStructure(
  content: DocumentContent,
  spec: Extract<ScoreSpec, { type: "TEST" }>,
  notes: QualityNote[],
): Measure {
  const present = new Set(content.blocks.map((block) => block.type));
  requireBlocks(present, TEST_BLOCKS, notes);

  const questions = content.blocks.filter(
    (block): block is QuestionBlock => block.type === "question",
  );
  const keyItems = content.blocks.flatMap((block) =>
    block.type === "answerKey" ? block.items : [],
  );

  // Savol soni — o'lchamning O'ZAGI: kredit aynan shunga qarab yechiladi.
  let points = 0;
  let total = 2;
  if (questions.length === spec.questionCount) {
    points += 2;
  } else {
    note(
      notes,
      "question_count",
      "question_count:mismatch",
      `Savollar soni ${String(questions.length)}, so'ralgani ${String(spec.questionCount)}`,
    );
  }

  const parts = [
    checkAnswerKey(questions, keyItems, notes),
    checkMcq(questions, notes),
    checkTrueFalse(questions, notes),
    checkMatch(questions, notes),
    checkBloom(questions, spec.bloomTargets, notes),
  ];
  for (const part of parts) {
    points += part.points;
    total += part.total;
  }

  return { raw: points / total };
}

/* ------------------------------------------------------------------ */
/* Taqdimot strukturasi (14-sessiya)                                   */
/* ------------------------------------------------------------------ */

/**
 * Slayd sonining ruxsat etilgan chetlanishi.
 *
 * Spetsifikatsiya ±2 deydi. Nega aniq son talab qilinmaydi: struktura
 * bosqichi `checkSlidesOutline` darvozasidan aniq son bilan o'tadi, ya'ni
 * generatsiyada chetlanish bo'lmaydi. Bu shift MUHARRIRDAN kelgan kontent
 * uchun: o'qituvchi ikki slaydni o'chirsa hujjati yiqilmasligi kerak.
 */
const SLIDE_COUNT_TOLERANCE = 2;

/** 6x6 qoidasining birinchi yarmi — ettinchi punkt shriftni kichraytiradi. */
const SLIDE_BULLETS_MAX = 6;

/**
 * Punkt uzunligi shifti.
 *
 * 90 belgi — proyektorda bir qarashda o'qiladigan chegara. Sxemadagi 200
 * belgidan ancha past va bu ATAYLAB: sxema saqlanishga ruxsat beradi, baho
 * esa o'qilmaydigan slaydni jazolaydi.
 */
const SLIDE_BULLET_CHARS = 90;

/** Shundan qisqa izoh o'qituvchiga hech narsa bermaydi. */
const SLIDE_NOTES_MIN = 40;

type SlideBlock = Extract<DocumentContent["blocks"][number], { type: "slide" }>;

function measureSlidesStructure(
  content: DocumentContent,
  spec: Extract<ScoreSpec, { type: "SLIDES" }>,
  notes: QualityNote[],
): Measure {
  const present = new Set(content.blocks.map((block) => block.type));
  requireBlocks(present, SLIDES_BLOCKS, notes);

  const slides = content.blocks.filter((block): block is SlideBlock => block.type === "slide");

  // Slayd soni — o'lchamning O'ZAGI: kredit aynan shunga qarab yechiladi.
  let points = 0;
  let total = 2;
  if (Math.abs(slides.length - spec.slideCount) <= SLIDE_COUNT_TOLERANCE) {
    points += 2;
  } else {
    note(
      notes,
      "slide_count",
      "slide_count:mismatch",
      `Slaydlar soni ${String(slides.length)}, so'ralgani ${String(spec.slideCount)}`,
    );
  }

  // Punkt soni — 6x6 qoidasi.
  total += 1;
  const crowded = slides.filter((slide) => slide.bullets.length > SLIDE_BULLETS_MAX);
  if (crowded.length === 0) {
    points += 1;
  } else {
    note(
      notes,
      "slide_bullets",
      "slide_bullets:too_many",
      `${String(crowded.length)} ta slaydda ${String(SLIDE_BULLETS_MAX)} dan ko'p punkt`,
    );
  }

  // Punkt uzunligi — proyektorda o'qilishi.
  total += 1;
  const long = slides
    .flatMap((slide) => slide.bullets)
    .filter((bullet) => bullet.length > SLIDE_BULLET_CHARS);
  if (long.length === 0) {
    points += 1;
  } else {
    note(
      notes,
      "slide_bullet_long",
      "slide_bullet:long",
      `${String(long.length)} ta punkt ${String(SLIDE_BULLET_CHARS)} belgidan uzun`,
    );
  }

  // Bosh slayd ko'rinishi faqat birinchi slaydda.
  total += 1;
  const misplaced = slides.filter((slide, index) => slide.layout === "title" && index !== 0);
  if (misplaced.length === 0) {
    points += 1;
  } else {
    note(
      notes,
      "slide_layout_title",
      "slide_layout:title_not_first",
      `${String(misplaced.length)} ta slaydda bosh slayd ko'rinishi o'rtada`,
    );
  }

  // "HAR SLAYDDA SARLAVHA BOR" QOIDASI BU YERDA YO'Q — ataylab.
  //
  // Spetsifikatsiya uni sifat tekshiruvi deb sanaydi, lekin blok sxemasidagi
  // `txt(120)` (`.trim().min(1)`) uni KUCHLIROQ qavatda kafolatlaydi:
  // sarlavhasiz slayd `DocumentContent.parse` dan o'tmaydi, ya'ni na
  // generatsiyadan, na muharrirdan (avtosaqlash ham shu sxemadan o'tadi)
  // bazaga yetib bormaydi. Bu yerga qoida yozish `LESSON_BLOCKS` izohidagi
  // "biz yozgan kodni biz tekshirdik" holatini yasardi — hech qachon
  // ishlamaydigan `if` va hech qachon chiqmaydigan izoh.
  // `tests/slides-blocks.test.ts` kafolatning o'zini qadab turadi.

  return { raw: points / total };
}

/** Anagramma ta'rifining eng qisqa uzunligi — bundan qisqasi topishga yetmaydi. */
const GAME_CLUE_MIN = 15;

type GameBlock = Extract<DocumentContent["blocks"][number], { type: "game" }>;

/**
 * O'yin strukturasi — ATAYLAB IKKI QOIDA.
 *
 * `lib/games/content.ts` sxemasi juda ko'p narsani KAFOLATLAB BERADI:
 * g'ildirakda aynan 8 ta takrorlanmas kategoriya, so'zlar normallashgan va
 * takrorlanmaydi, anagrammada 6-12 element. Bularga qoida yozish
 * `LESSON_BLOCKS` izohidagi "biz yozgan kodni biz tekshirdik" holatini
 * yasardi — hech qachon ishlamaydigan `if` va hech qachon chiqmaydigan izoh.
 *
 * Shuning uchun faqat sxema KAFOLATLAMAYDIGAN ikki narsa tekshiriladi:
 *   1. element soni O'QITUVCHI SO'RAGANIGA teng (sxema oraliqni biladi,
 *      so'ralgan aniq sonni esa `spec` biladi) — bu pul masalasi;
 *   2. anagramma ta'rifi topishga yetarlicha uzun (sxema faqat `min(1)`).
 *
 * "Joylashmagan so'z" qoidasi bu yerda YO'Q: u `buildWordSearch` ni
 * chaqirishni talab qiladi va u keyingi commitda paydo bo'ladi.
 */
function measureGameStructure(
  content: DocumentContent,
  spec: Extract<ScoreSpec, { type: "GAME" }>,
  notes: QualityNote[],
): Measure {
  const present = new Set(content.blocks.map((block) => block.type));
  requireBlocks(present, GAME_BLOCKS, notes);

  const games = content.blocks.filter((block): block is GameBlock => block.type === "game");

  let points = 0;
  let total = 1;

  // Element soni — kredit aynan shunga qarab yechiladi (`cost-table.ts`).
  // `reduce`: hujjatda bitta `game` bloki bo'ladi, lekin sxema buni
  // qulflamaydi (`blocks.ts` izohi), shuning uchun jami hisoblanadi.
  const itemCount = games.reduce((sum, block) => sum + gameItemCount(block.content), 0);
  if (itemCount === spec.itemCount) {
    points += 1;
  } else {
    note(
      notes,
      "game_item_count",
      "game_item_count:mismatch",
      `O'yin elementlari soni ${String(itemCount)}, so'ralgani ${String(spec.itemCount)}`,
    );
  }

  // JOYLASHMAGAN SO'Z — panjara HAQIQATAN qurilib tekshiriladi.
  //
  // Mazmunni o'qib "so'zlar joyida" deb qabul qilish yetarli emas:
  // joylashuv `seed` ga bog'liq, ya'ni faqat `buildWordSearch` ni
  // chaqirgandan keyin ma'lum bo'ladi. `build` sof va 200 ms dan tez,
  // shuning uchun bahoda chaqirish xavfsiz.
  const unplaced = games.flatMap((block) =>
    block.content.kind === "word-search"
      ? buildWordSearch(block.content, block.seed).unplaced
      : [],
  );
  if (unplaced.length > 0) {
    note(
      notes,
      "game_words_unplaced",
      "game_words:unplaced",
      `${String(unplaced.length)} ta so'z panjaraga joylashmadi: ${unplaced.join(", ")}`,
    );
  }

  // Ta'rif uzunligi — FAQAT anagrammada. G'ildirakda savol/javob, so'z
  // qidirishda esa umuman ta'rif yo'q, ya'ni boshqa turlarda bu o'lcham
  // ma'nosiz bo'lardi va ballni bekorga ko'tarardi.
  const clues = games.flatMap((block) =>
    block.content.kind === "anagram" ? block.content.items.map((item) => item.clue) : [],
  );
  if (clues.length > 0) {
    total += 1;
    const short = clues.filter((clue) => clue.length < GAME_CLUE_MIN);
    if (short.length === 0) {
      points += 1;
    } else {
      note(
        notes,
        "game_clue_short",
        "game_clue:short",
        `${String(short.length)} ta ta'rif ${String(GAME_CLUE_MIN)} belgidan qisqa`,
      );
    }
  }

  return { raw: points / total };
}

/**
 * Kurikulum qamrovi — rasmiy maqsad va kalit so'zlarning matnda uchrashi.
 *
 * PREFIKS bo'yicha solishtiriladi (yuqoridagi `PREFIX_LEN` izohiga qarang).
 *
 * @param hasContext Hujjat kurikulum parchalari (`SourceChunk`) ustiga
 *        qurilganmi. Parcha topilmagan bo'lsa model kurikulum atamalarini
 *        qayerdan ham bilsin — bu o'lcham hujjatni emas, bazamizdagi
 *        bo'shliqni o'lchagan bo'lardi.
 */
function measureCoverage(
  text: string,
  terms: string[],
  hasContext: boolean,
  notes: QualityNote[],
): Measure {
  if (!hasContext) {
    return { skip: "kurikulum konteksti yo'q (SourceChunk topilmadi)" };
  }

  const wanted = new Set<string>();
  for (const term of terms) {
    for (const word of words(term)) {
      if (word.length < MIN_TERM_LEN) continue;
      if (STOPWORDS.has(word)) continue;
      wanted.add(word);
    }
  }

  // Kurikulumda kalit so'z yo'q — o'lchaydigan narsa yo'q, TEKIN BALL HAM
  // YO'Q: vazn qolgan o'lchamlarga taqsimlanadi.
  if (wanted.size === 0) {
    return { skip: "kurikulumda maqsad/kalit so'z yo'q" };
  }

  const haystack = new Set(words(text).map(stem));
  const missing: string[] = [];
  for (const word of wanted) {
    if (!haystack.has(stem(word))) missing.push(word);
  }

  const covered = (wanted.size - missing.length) / wanted.size;
  if (missing.length > 0) {
    note(
      notes,
      "coverage_missing",
      "coverage:missing",
      // Ro'yxat kesiladi: 40 ta so'z `qualityNotes` ni shovqinga ko'mardi.
      `Kurikulum atamalari matnda yo'q: ${missing.slice(0, 8).sort().join(", ")}`,
    );
  }

  return { raw: covered };
}

/**
 * `render.ts` qo'yadigan ro'yxat prefikslari.
 *
 * Detektor ularni O'TKAZIB YUBORISHI kerak: model `##` ni maqsad matnining
 * ichiga yozsa, u bizning chiqishimizda "• ## Harakat" bo'lib ko'rinadi.
 * Sof `^#` anchor'i bunday artefaktni ko'rmay qolardi, o'qituvchi esa
 * ko'rardi.
 */
const LIST_PREFIX = String.raw`(?:• |\d+\. )?`;

/** Markdown artefaktlari — model ko'rsatmaga qaramay qo'yib yuboradi. */
const MARKDOWN_PATTERNS: Array<{ code: string; re: RegExp; label: string }> = [
  { code: "md:bold", re: /\*\*/, label: "qalin (**)" },
  { code: "md:heading", re: new RegExp(`^\\s*${LIST_PREFIX}#{1,6}\\s`, "m"), label: "sarlavha (#)" },
  { code: "md:bullet", re: new RegExp(`^\\s*${LIST_PREFIX}[-*]\\s`, "m"), label: "ro'yxat (-)" },
  { code: "md:fence", re: /```/, label: "kod bloki (```)" },
  { code: "md:table", re: /^\s*\|.*\|/m, label: "jadval (|)" },
];

function measureLanguage(text: string, notes: QualityNote[]): Measure {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return { skip: "matnda harf yo'q" };

  let raw = 1;

  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0;
  const ratio = cyrillic / letters;

  if (ratio > CYRILLIC_LIMIT) {
    note(
      notes,
      "lang_cyrillic",
      "lang:cyrillic",
      `Kirill belgilar ulushi ${(ratio * 100).toFixed(1)} % — lotin so'ralgan edi`,
    );
    // Ulush qancha katta bo'lsa, jarima shuncha og'ir; to'liq kirill matn 0.
    raw -= Math.min(0.6, ratio * 6);
  }

  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.re.test(text)) {
      note(notes, "md_artifact", pattern.code, `Matnda markdown belgisi bor: ${pattern.label}`);
      raw -= 0.1;
    }
  }

  return { raw: Math.max(0, raw) };
}

/**
 * Uzunlik — blok turiga qarab.
 *
 * Model ba'zan sxemani bajaradi, lekin mazmunni "ha", "mashq" kabi bir
 * so'zga qisqartiradi. Sxema buni ushlamaydi (`min(3)` o'tadi), o'qituvchi
 * esa ishlata olmaydi.
 */
function measureLength(content: DocumentContent, notes: QualityNote[]): Measure {
  let total = 0;
  let short = 0;

  for (const block of content.blocks) {
    switch (block.type) {
      case "objectives":
        for (const item of block.items) {
          total += 1;
          if (item.length < 20) short += 1;
        }
        break;
      case "stages":
        for (const stage of block.items) {
          for (const action of [...stage.teacherActions, ...stage.studentActions]) {
            total += 1;
            if (action.length < 15) short += 1;
          }
        }
        break;
      case "homework":
        for (const item of block.items) {
          total += 1;
          if (item.length < 20) short += 1;
        }
        break;
      // Savol matni: "Tezlanish?" sxemadan o'tadi, lekin savol emas.
      case "question":
        total += 1;
        if (block.text.length < 25) short += 1;
        break;
      // SLAYD PUNKTLARI O'LCHANMAYDI: qisqa punkt bu yerda MAQSAD, nuqson
      // emas — uzunligini `measureSlidesStructure` teskari yo'nalishda
      // jazolaydi, ikkisi birga qo'shilsa model qisqartirsa ham, uzaytirsa
      // ham ball yo'qotardi. O'lchanadigan narsa `notes`: o'qituvchi sinfda
      // aynan shuni o'qiydi.
      case "slide":
        if (block.notes !== undefined) {
          total += 1;
          if (block.notes.length < SLIDE_NOTES_MIN) short += 1;
        }
        break;
      default:
        break;
    }
  }

  if (total === 0) return { skip: "o'lchanadigan band yo'q" };

  const ratio = short / total;
  if (ratio > 0.2) {
    note(
      notes,
      "length_short",
      "length:short",
      `${String(short)} / ${String(total)} band juda qisqa`,
    );
  }

  return { raw: 1 - ratio };
}

/* ------------------------------------------------------------------ */
/* Umumiy baho                                                         */
/* ------------------------------------------------------------------ */

/** Uch xonagacha: `Float` ustuniga 0.7000000000000001 tushmasin. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Hisobga kirgan o'lchamlarni qayta normallashtirib qo'shadi.
 *
 * Chiqarib tashlangan o'lchamning vazni qolganlariga PROPORSIONAL
 * taqsimlanadi. Ya'ni qamrovsiz mavzuda struktura 0.4 emas, 0.53 vazn oladi
 * — hujjat "qamrovi yo'qligi uchun" jazolanmaydi ham, mukofotlanmaydi ham.
 */
function aggregate(measures: Record<ComponentName, Measure>): {
  weighted: number;
  components: Record<ComponentName, ComponentScore>;
} {
  const names = Object.keys(WEIGHTS) as ComponentName[];
  const appliedSum = names.reduce(
    (sum, name) => ("skip" in measures[name] ? sum : sum + WEIGHTS[name]),
    0,
  );

  let weighted = 0;
  const components = {} as Record<ComponentName, ComponentScore>;

  for (const name of names) {
    const measure = measures[name];
    const baseWeight = WEIGHTS[name];

    if ("skip" in measure) {
      components[name] = { raw: 0, baseWeight, weight: 0, applied: false, skipReason: measure.skip };
      continue;
    }

    // `appliedSum` nol bo'lishi uchun HAMMA o'lcham chiqib ketishi kerak;
    // struktura hech qachon chiqmaydi, lekin bo'linishni himoyalab qo'yamiz.
    const weight = appliedSum === 0 ? 0 : baseWeight / appliedSum;
    components[name] = { raw: round3(measure.raw), baseWeight, weight: round3(weight), applied: true };
    weighted += measure.raw * weight;
  }

  return { weighted, components };
}

export function scoreDocument(input: {
  content: DocumentContent;
  /** Hujjat turiga xos parametrlar — yuqoridagi `ScoreSpec`. */
  spec: ScoreSpec;
  /** `Topic.objectives` va `Topic.keywords` — kurikulum qamrovi uchun. */
  curriculumTerms: string[];
  /**
   * Hujjat kurikulum parchalari ustiga qurilganmi
   * (`inputParams.contextChunkIds` bo'shmi). `false` bo'lsa qamrov
   * o'lchami butunlay hisobdan chiqadi.
   */
  hasContext: boolean;
}): QualityReport {
  const notes: QualityNote[] = [];
  const text = renderDocument(input.content);

  const { weighted, components } = aggregate({
    structure: measureStructure(input.content, input.spec, notes),
    coverage: measureCoverage(text, input.curriculumTerms, input.hasContext, notes),
    language: measureLanguage(text, notes),
    length: measureLength(input.content, notes),
  });

  // VETO. `Math.min` ataylab: shift ostida ball o'z qiymatini saqlaydi, ya'ni
  // yiqilgan hujjatlarni ham yomondan yaxshiga saralab bo'ladi.
  const cappedByError = notes.some((n) => n.severity === "error");
  const score = cappedByError ? Math.min(weighted, ERROR_CEILING) : weighted;

  return {
    score: round3(score),
    weighted: round3(weighted),
    cappedByError,
    components,
    notes,
  };
}
