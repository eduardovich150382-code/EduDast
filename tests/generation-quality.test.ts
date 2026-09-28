import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import {
  ERROR_CEILING,
  RULES,
  SCORE_FAIL,
  SCORE_WARN,
  scoreDocument,
} from "@/lib/generation/quality";

/**
 * Sifat bahosi — `fixtures/documents/` dagi namunalar ustida.
 *
 * Namunalar FAYLDA, testda inline emas: ular haqiqiy generatsiya
 * chiqishiga o'xshash hajmda va inline yozilsa test o'qilmas bo'lib
 * ketardi. Fayl shakli buzilsa `DocumentContent.parse` darhol yiqiladi.
 *
 * ENG MUHIM BLOK — "veto darvozasi": darvoza ishlayotganini aynan o'sha
 * testlar qotiradi. Ilgari ball sof og'irlangan o'rtacha edi va yomon
 * namunalar ham 0.88 olardi, ya'ni `SCORE_FAIL` hech qachon ishlamasdi.
 */

const DURATION = 45;

/** Namunalardagi mavzuning rasmiy kurikulum atamalari. */
const TERMS = ["tezlanish", "harakat", "tezlik", "formula"];

function load(name: string) {
  const raw = readFileSync(join(__dirname, "..", "fixtures", "documents", name), "utf-8");
  // `parse`, `safeParse` emas: namuna buzuq bo'lsa test AYNI shu yerda
  // yiqilsin, keyinroq tushunarsiz ball farqi bilan emas.
  return DocumentContent.parse(JSON.parse(raw));
}

function score(name: string, terms: string[] = TERMS, hasContext = true) {
  return scoreDocument({
    content: load(name),
    durationMinutes: DURATION,
    curriculumTerms: terms,
    hasContext,
  });
}

function codes(name: string, terms: string[] = TERMS): string[] {
  return score(name, terms).notes.map((note) => note.code);
}

describe("veto darvozasi", () => {
  it("shift SCORE_FAIL dan past — veto haqiqatan yiqitadi", () => {
    // Bu munosabat buzilsa (masalan kimdir SCORE_FAIL ni 0.4 ga tushirsa)
    // veto jimgina ishlamay qolardi: hujjat "error" bilan ham DONE bo'lardi.
    expect(ERROR_CEILING).toBeLessThan(SCORE_FAIL);
  });

  it.each([
    ["daqiqa-buzilgan.json", "minutes:drift"],
    ["rus-aralashgan.json", "lang:cyrillic"],
    ["javob-kaliti-yoq.json", "missing_block:answerKey"],
  ])("%s — FAILED chegarasidan past", (file, expectedCode) => {
    const report = score(file);
    expect(report.notes.map((n) => n.code)).toContain(expectedCode);
    expect(report.cappedByError).toBe(true);
    expect(report.score).toBeLessThan(SCORE_FAIL);
  });

  it("vetodan oldingi ball hisobotda saqlanadi", () => {
    // Diagnostika uchun: "qaysi biri yiqitdi" savoliga javob `weighted` va
    // `components` da, faqat yakuniy ballda emas.
    const report = score("rus-aralashgan.json");
    expect(report.weighted).toBeGreaterThan(report.score);
  });

  it("vetoda ham hujjatlar o'zaro saralanadi — shift Math.min", () => {
    // Bo'sh hujjat ham, daqiqasi buzilgani ham FAILED; lekin bo'shi PASTROQ.
    const empty = scoreDocument({
      content: { v: 1, blocks: [] },
      durationMinutes: DURATION,
      curriculumTerms: TERMS,
      hasContext: true,
    });
    expect(empty.score).toBeLessThan(score("daqiqa-buzilgan.json").score);
  });

  it("faqat warn bo'lsa hujjat yiqilmaydi", () => {
    // Markdown artefakti — o'qituvchi qo'lda tozalaydi, pul qaytarilmaydi.
    const report = score("markdown-aralashgan.json");
    expect(report.notes.every((n) => n.severity === "warn")).toBe(true);
    expect(report.cappedByError).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(SCORE_FAIL);
  });

  it("har izohning darajasi RULES jadvalidan keladi", () => {
    // Daraja `if` ning yonida emas, bitta jadvalda — bu PUL QARORI.
    for (const file of ["daqiqa-buzilgan.json", "rus-aralashgan.json", "yaxshi.json"]) {
      for (const note of score(file).notes) {
        expect(note.severity).toBe(RULES[note.rule].severity);
      }
    }
  });
});

describe("yaxshi namuna", () => {
  it("yuqori ball oladi va ogohlantirishsiz o'tadi", () => {
    const report = score("yaxshi.json");
    expect(report.score).toBeGreaterThanOrEqual(SCORE_WARN);
    expect(report.notes.some((n) => n.severity === "error")).toBe(false);
  });

  it("struktura va til to'liq ball", () => {
    const report = score("yaxshi.json");
    expect(report.components.structure.raw).toBe(1);
    expect(report.components.language.raw).toBe(1);
  });

  it("ball 0 va 1 oralig'ida", () => {
    const report = score("yaxshi.json");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(1);
  });
});

describe("daqiqa chetlanishi ikki bosqichli", () => {
  it("10–25 % — OGOHLANTIRISH, hujjat yiqilmaydi", () => {
    // 10+10+10+10 = 40, so'ralgani 45 -> 11 %. O'qituvchi bir bosqichga
    // 5 daqiqa qo'shib ishlatadi; buning uchun kreditni qaytarish noto'g'ri.
    const report = score("daqiqa-qochgan.json");
    expect(report.notes.map((n) => n.code)).toContain("minutes:soft_drift");
    expect(report.cappedByError).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(SCORE_FAIL);
  });

  it("25 % dan ortiq — VETO", () => {
    // 4 x 5 = 20, so'ralgani 45 -> 56 %. Bu boshqa uzunlikdagi dars.
    expect(codes("daqiqa-buzilgan.json")).toContain("minutes:drift");
  });

  it("yumshoq chetlanish yaxshi namunadan past ball beradi", () => {
    expect(score("daqiqa-qochgan.json").score).toBeLessThan(score("yaxshi.json").score);
  });

  it("qattiq chetlanish yumshog'idan ham past", () => {
    expect(score("daqiqa-buzilgan.json").score).toBeLessThan(score("daqiqa-qochgan.json").score);
  });
});

describe("rus tili aralashgan namuna", () => {
  it("lang:cyrillic belgilanadi", () => {
    expect(codes("rus-aralashgan.json")).toContain("lang:cyrillic");
  });

  it("til balli pasayadi", () => {
    expect(score("rus-aralashgan.json").components.language.raw).toBeLessThan(1);
  });
});

describe("javob kaliti yo'q namuna", () => {
  it("missing_block:answerKey belgilanadi", () => {
    expect(codes("javob-kaliti-yoq.json")).toContain("missing_block:answerKey");
  });

  it("savol umuman bo'lmasa javob kaliti TALAB QILINMAYDI", () => {
    // "yaxshi" namunada savol yo'q — kalit ham kerak emas.
    expect(codes("yaxshi.json")).not.toContain("missing_block:answerKey");
  });
});

describe("markdown aralashgan namuna", () => {
  it("md:bold va md:heading belgilanadi", () => {
    const found = codes("markdown-aralashgan.json");
    expect(found).toContain("md:bold");
    expect(found).toContain("md:heading");
  });
});

describe("sxema kafolatlagan tekshiruvlar ball TO'QIMAYDI", () => {
  it("majburiy bloklar borligi uchun ball berilmaydi", () => {
    // `stage1Blocks`/`stage2Blocks`/`stage3Blocks` bu bloklarni HAR DOIM
    // qo'yadi. Ular ballga kirsa, har hujjat tekinga 5/7 struktura olardi va
    // daqiqa darvozasi ballda deyarli ko'rinmasdi.
    //
    // Endi struktura FAQAT daqiqadan iborat (savolsiz hujjatda): daqiqasi
    // buzilgan namunada u toza 0.
    expect(score("daqiqa-buzilgan.json").components.structure.raw).toBe(0);
  });

  it("blok yo'qolib qolsa VETO izohi baribir chiqadi", () => {
    // Ball bermasa ham tekshiruv qoladi: bosqichlardan biri commit bo'lmay
    // hujjat chala qolgan holat shu yerda ushlanadi.
    const report = scoreDocument({
      content: { v: 1, blocks: [] },
      durationMinutes: DURATION,
      curriculumTerms: TERMS,
      hasContext: true,
    });
    expect(report.notes.map((n) => n.code)).toContain("missing_block:homework");
    expect(report.score).toBeLessThan(SCORE_FAIL);
  });
});

describe("kalit so'z qamrovi — o'zbek agglutinatsiyasi", () => {
  it("qo'shimchali so'zlar TO'LIQ qamrov beradi", () => {
    // Namunada "tezlanishni", "harakatlarni", "tezliklarni", "formulaga" —
    // hech biri kalit so'zning aynan o'zi emas. Aynan solishtirishda
    // qamrov 0 bo'lardi.
    const report = score("qoshimchali.json");
    expect(report.components.coverage.raw).toBe(1);
    expect(report.notes.map((n) => n.code)).not.toContain("coverage:missing");
  });

  it("umuman boshqa atama topilmasa qamrov pasayadi", () => {
    const report = score("yaxshi.json", ["fotosintez", "xlorofill"]);
    expect(report.components.coverage.raw).toBe(0);
    expect(report.notes.map((n) => n.code)).toContain("coverage:missing");
  });

  it("qamrov yetishmasligi hujjatni YIQITMAYDI", () => {
    // Prefiks-stemming taxminiy: sinonim ishlatgan to'g'ri hujjat ham
    // "atama yo'q" deb belgilanishi mumkin. Taxminiy o'lcham pul to'langan
    // hujjatni bekor qilmasligi kerak — shuning uchun `warn`.
    const report = score("yaxshi.json", ["fotosintez", "xlorofill"]);
    expect(report.cappedByError).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(SCORE_FAIL);
  });

  it("apostrof varianti qamrovni buzmaydi", () => {
    // "o'lchash" (ASCII apostrof) va "oʻlchash" (U+02BB) bir so'z.
    const report = score("qoshimchali.json", ["oʻlchash"]);
    expect(report.components.coverage.raw).toBe(1);
  });

  it("stopword qamrovni soxta ko'tarmaydi", () => {
    // "uchun" har matnda bor; u hisobga kirsa qamrov doim yuqori bo'lardi.
    const report = score("yaxshi.json", ["uchun", "fotosintez"]);
    expect(report.components.coverage.raw).toBe(0);
  });
});

describe("vazndan chiqarish va qayta normallashtirish", () => {
  it("kurikulumda atama bo'lmasa qamrov TEKIN BALL BERMAYDI", () => {
    const report = score("yaxshi.json", []);
    expect(report.components.coverage.applied).toBe(false);
    expect(report.components.coverage.weight).toBe(0);
    expect(report.components.coverage.skipReason).toBeTruthy();
  });

  it("SourceChunk topilmagan bo'lsa qamrov chiqariladi", () => {
    const report = score("yaxshi.json", TERMS, false);
    expect(report.components.coverage.applied).toBe(false);
  });

  it("chiqarilgan o'lchamning vazni qolganlariga taqsimlanadi", () => {
    const report = score("yaxshi.json", []);
    const applied = Object.values(report.components).filter((c) => c.applied);
    const sum = applied.reduce((total, c) => total + c.weight, 0);
    // Vaznlar uch xonagacha yaxlitlangani uchun yig'indi 1 ga TAXMINAN teng.
    expect(sum).toBeCloseTo(1, 2);
    // 0.4 / (0.4 + 0.25 + 0.1) = 0.533
    expect(report.components.structure.weight).toBeCloseTo(0.533, 2);
  });

  it("qamrovsiz mukammal hujjat baribir 1.0 oladi", () => {
    // Chiqarish JAZO EMAS: kurikulumi bo'sh mavzu hujjatni pasaytirmaydi.
    expect(score("yaxshi.json", []).score).toBe(1);
  });

  it("qamrovsiz yomon hujjat qamrov hisobiga KO'TARILMAYDI", () => {
    // Eski xatti-harakat: qamrov yo'q -> 1.0 qaytarardi, ya'ni hujjat
    // o'lchanmagan narsa uchun 0.25 tekin ball olardi.
    const report = score("daqiqa-buzilgan.json", []);
    expect(report.weighted).toBeLessThan(score("daqiqa-buzilgan.json").weighted + 0.25);
    expect(report.score).toBeLessThan(SCORE_FAIL);
  });
});

describe("hisobot shakli", () => {
  it("har komponentning xom bali va vazni alohida yoziladi", () => {
    // `Document.qualityNotes` ga shu obyekt tushadi — DONE hujjatlarda ham.
    // Keyin real trafikda "qaysi o'lcham yiqitmoqda" savoliga shu javob
    // beradi.
    const report = score("daqiqa-qochgan.json");
    for (const name of ["structure", "coverage", "language", "length"] as const) {
      const part = report.components[name];
      expect(part.raw).toBeGreaterThanOrEqual(0);
      expect(part.raw).toBeLessThanOrEqual(1);
      expect(part.baseWeight).toBeGreaterThan(0);
      expect(typeof part.applied).toBe("boolean");
    }
  });

  it("ball uch xonagacha yaxlitlanadi", () => {
    // `Float` ustuniga 0.7000000000000001 tushmasligi kerak.
    const value = score("daqiqa-qochgan.json").score;
    expect(Math.round(value * 1000)).toBe(value * 1000);
  });

  it("izohlarda barqaror kod va qoida kaliti bor", () => {
    for (const note of score("daqiqa-buzilgan.json").notes) {
      expect(note.code).toMatch(/^[a-z_]+(:[A-Za-z_]+)?$/);
      expect(["error", "warn"]).toContain(note.severity);
      expect(RULES[note.rule]).toBeDefined();
    }
  });
});
