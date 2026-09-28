import type { DocumentContent } from "@/lib/documents/blocks";
import { renderDocument } from "@/lib/documents/render";

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
  | "length_short";

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
 * Sxema KAFOLATLAGAN bloklar.
 *
 * Ular BALLGA KIRMAYDI, faqat veto izohi beradi. Sabab: bu bloklarni
 * `lib/generation/plans.ts` dagi `stage1Blocks`/`stage2Blocks`/`stage3Blocks`
 * har doim qo'yadi, ya'ni ular uchun ball berish "biz yozgan kodni biz
 * tekshirdik" degani — ball to'qib beradi, xolos. Tekshiruv baribir qoladi:
 * bosqichlardan biri commit bo'lmay hujjat chala qolgan holat veto bilan
 * ushlanadi.
 */
const REQUIRED_BLOCKS = ["heading", "objectives", "materials", "stages", "homework"] as const;

function measureStructure(
  content: DocumentContent,
  durationMinutes: number,
  notes: QualityNote[],
): Measure {
  const present = new Set(content.blocks.map((block) => block.type));

  for (const type of REQUIRED_BLOCKS) {
    if (!present.has(type)) {
      note(notes, "missing_block", `missing_block:${type}`, `Majburiy blok yo'q: ${type}`);
    }
  }

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
  durationMinutes: number;
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
    structure: measureStructure(input.content, input.durationMinutes, notes),
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
