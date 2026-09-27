import type { DocumentContent } from "@/lib/documents/blocks";
import { renderDocument } from "@/lib/documents/render";

/**
 * AI'SIZ sifat bahosi.
 *
 * SOF FUNKSIYA: bazaga bormaydi, tarmoqqa chiqmaydi, vaqtga bog'liq emas
 * (`lib/credits/cost-table.ts` naqshi). Sabab: hujjatni baholash uchun
 * ikkinchi LLM chaqirish narxni ikki barobar oshirardi va "baholovchi ham
 * xato qiladi" muammosini qo'shardi. Bu yerdagi tekshiruvlar mexanik, lekin
 * aynan MEXANIK xatolar (daqiqa yig'indisi, rus tili aralashuvi, markdown
 * artefaktlari) eng ko'p uchraydi.
 *
 * Ball `Document.qualityScore` ga, tafsilot `Document.qualityNotes` ga
 * yoziladi.
 */

/** Shu balldan past — hujjat yaroqsiz: `FAILED` + kredit qaytariladi. */
export const SCORE_FAIL = 0.5;

/** Shu balldan past, lekin `SCORE_FAIL` dan yuqori — `DONE` + ogohlantirish. */
export const SCORE_WARN = 0.7;

/** Daqiqa yig'indisining ruxsat etilgan chetlanishi. */
const MINUTES_TOLERANCE = 0.1;

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

export type QualityNote = {
  /** Barqaror kalit — admin panelida guruhlash uchun (erkin matn emas). */
  code: string;
  severity: "error" | "warn";
  message: string;
};

export type QualityReport = {
  /** 0..1 */
  score: number;
  parts: {
    structure: number;
    coverage: number;
    language: number;
    length: number;
  };
  notes: QualityNote[];
};

/**
 * O'lchamlarning vazni.
 *
 * `structure` eng og'ir: daqiqalari to'g'ri kelmagan yoki uy vazifasi yo'q
 * ishlanmani o'qituvchi sinfda ishlata olmaydi. `language` ham yuqori —
 * kirill yoki markdown aralashgan matn to'g'ridan-to'g'ri ko'zga tashlanadi.
 */
const WEIGHTS = { structure: 0.4, coverage: 0.25, language: 0.25, length: 0.1 } as const;

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

/* ------------------------------------------------------------------ */
/* O'lchamlar                                                          */
/* ------------------------------------------------------------------ */

function scoreStructure(
  content: DocumentContent,
  durationMinutes: number,
  notes: QualityNote[],
): number {
  const present = new Set(content.blocks.map((block) => block.type));
  const required = ["heading", "objectives", "materials", "stages", "homework"] as const;

  let points = 0;
  let total = 0;

  for (const type of required) {
    total += 1;
    if (present.has(type)) {
      points += 1;
    } else {
      notes.push({
        code: `missing_block:${type}`,
        severity: "error",
        message: `Majburiy blok yo'q: ${type}`,
      });
    }
  }

  // Daqiqa yig'indisi.
  total += 2;
  const stageBlocks = content.blocks.filter((block) => block.type === "stages");
  if (stageBlocks.length === 0) {
    notes.push({
      code: "minutes:no_stages",
      severity: "error",
      message: "Dars bosqichlari yo'q, daqiqa yig'indisi tekshirilmadi",
    });
  } else {
    const minutes = stageBlocks.reduce(
      (sum, block) => sum + block.items.reduce((inner, stage) => inner + stage.minutes, 0),
      0,
    );
    const drift = Math.abs(minutes - durationMinutes) / durationMinutes;
    if (drift <= MINUTES_TOLERANCE) {
      points += 2;
    } else {
      notes.push({
        code: "minutes:drift",
        severity: "error",
        message: `Bosqich daqiqalari ${String(minutes)}, so'ralgani ${String(durationMinutes)}`,
      });
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
      notes.push({
        code: "missing_block:answerKey",
        severity: "error",
        message: "Savollar bor, lekin javoblar kaliti yo'q",
      });
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
      notes.push({
        code: "mcq:invalid",
        severity: "error",
        message: `${String(broken.length)} ta test savoli variant qoidasiga mos emas`,
      });
    }
  }

  return total === 0 ? 1 : points / total;
}

/**
 * Kurikulum qamrovi — rasmiy maqsad va kalit so'zlarning matnda uchrashi.
 *
 * PREFIKS bo'yicha solishtiriladi (yuqoridagi `PREFIX_LEN` izohiga qarang).
 */
function scoreCoverage(text: string, terms: string[], notes: QualityNote[]): number {
  const haystack = new Set(words(text).map(stem));

  const wanted = new Set<string>();
  for (const term of terms) {
    for (const word of words(term)) {
      if (word.length < MIN_TERM_LEN) continue;
      if (STOPWORDS.has(word)) continue;
      wanted.add(word);
    }
  }

  // Kurikulumda kalit so'z yo'q bo'lsa — jarima yo'q, to'liq ball.
  if (wanted.size === 0) return 1;

  const missing: string[] = [];
  for (const word of wanted) {
    if (!haystack.has(stem(word))) missing.push(word);
  }

  const covered = (wanted.size - missing.length) / wanted.size;
  if (missing.length > 0) {
    notes.push({
      code: "coverage:missing",
      severity: covered < 0.5 ? "error" : "warn",
      // Ro'yxat kesiladi: 40 ta so'z `qualityNotes` ni shovqinga ko'mardi.
      message: `Kurikulum atamalari matnda yo'q: ${missing.slice(0, 8).sort().join(", ")}`,
    });
  }

  return covered;
}

/** Markdown artefaktlari — model ko'rsatmaga qaramay qo'yib yuboradi. */
/**
 * `render.ts` qo'yadigan ro'yxat prefikslari.
 *
 * Detektor ularni O'TKAZIB YUBORISHI kerak: model `##` ni maqsad matnining
 * ichiga yozsa, u bizning chiqishimizda "• ## Harakat" bo'lib ko'rinadi.
 * Sof `^#` anchor'i bunday artefaktni ko'rmay qolardi, o'qituvchi esa
 * ko'rardi.
 */
const LIST_PREFIX = String.raw`(?:• |\d+\. )?`;

const MARKDOWN_PATTERNS: Array<{ code: string; re: RegExp; label: string }> = [
  { code: "md:bold", re: /\*\*/, label: "qalin (**)" },
  { code: "md:heading", re: new RegExp(`^\\s*${LIST_PREFIX}#{1,6}\\s`, "m"), label: "sarlavha (#)" },
  { code: "md:bullet", re: new RegExp(`^\\s*${LIST_PREFIX}[-*]\\s`, "m"), label: "ro'yxat (-)" },
  { code: "md:fence", re: /```/, label: "kod bloki (```)" },
  { code: "md:table", re: /^\s*\|.*\|/m, label: "jadval (|)" },
];

function scoreLanguage(text: string, notes: QualityNote[]): number {
  let score = 1;

  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0;
  const ratio = letters === 0 ? 0 : cyrillic / letters;

  if (ratio > CYRILLIC_LIMIT) {
    notes.push({
      code: "lang:cyrillic",
      severity: "error",
      message: `Kirill belgilar ulushi ${(ratio * 100).toFixed(1)} % — lotin so'ralgan edi`,
    });
    // Ulush qancha katta bo'lsa, jarima shuncha og'ir; to'liq kirill matn 0.
    score -= Math.min(0.6, ratio * 6);
  }

  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.re.test(text)) {
      notes.push({
        code: pattern.code,
        severity: "warn",
        message: `Matnda markdown belgisi bor: ${pattern.label}`,
      });
      score -= 0.1;
    }
  }

  return Math.max(0, score);
}

/**
 * Uzunlik — blok turiga qarab.
 *
 * Model ba'zan sxemani bajaradi, lekin mazmunni "ha", "mashq" kabi bir
 * so'zga qisqartiradi. Sxema buni ushlamaydi (`min(3)` o'tadi), o'qituvchi
 * esa ishlata olmaydi.
 */
function scoreLength(content: DocumentContent, notes: QualityNote[]): number {
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

  if (total === 0) return 1;

  const ratio = short / total;
  if (ratio > 0.2) {
    notes.push({
      code: "length:short",
      severity: "warn",
      message: `${String(short)} / ${String(total)} band juda qisqa`,
    });
  }

  return 1 - ratio;
}

/* ------------------------------------------------------------------ */
/* Umumiy baho                                                         */
/* ------------------------------------------------------------------ */

export function scoreDocument(input: {
  content: DocumentContent;
  durationMinutes: number;
  /** `Topic.objectives` va `Topic.keywords` — kurikulum qamrovi uchun. */
  curriculumTerms: string[];
}): QualityReport {
  const notes: QualityNote[] = [];
  const text = renderDocument(input.content);

  const parts = {
    structure: scoreStructure(input.content, input.durationMinutes, notes),
    coverage: scoreCoverage(text, input.curriculumTerms, notes),
    language: scoreLanguage(text, notes),
    length: scoreLength(input.content, notes),
  };

  const score =
    parts.structure * WEIGHTS.structure +
    parts.coverage * WEIGHTS.coverage +
    parts.language * WEIGHTS.language +
    parts.length * WEIGHTS.length;

  // Uch xonagacha yaxlitlash: `Float` ustuniga 0.7000000000000001 tushmasin.
  return { score: Math.round(score * 1000) / 1000, parts, notes };
}
