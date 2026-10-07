import { describe, expect, it } from "vitest";
import { UNIT_LIMITS } from "@/lib/credits/cost-table";
import {
  QUESTION_KINDS,
  type QuestionKind,
} from "@/lib/generation/prompts";
import {
  MAX_DURATION,
  MIN_DURATION,
  startSchema,
} from "@/lib/generation/start-input";
import {
  confirmQuery,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  DEFAULT_KINDS,
  DEFAULT_QUESTION_COUNT,
  DEFAULT_SLIDE_COUNT,
  DURATIONS,
  inferStep,
  MAX_QUERY_LENGTH,
  paramsCompleteForType,
  parseWizardParams,
  previousStep,
  QUESTION_COUNTS,
  resolveParams,
  resolveStep,
  SLIDE_COUNTS,
  startInputFor,
  toggleKind,
  WIZARD_STEPS,
  wizardQuery,
  wizardQueryFromDocument,
  type WizardParams,
} from "@/lib/generation/wizard-params";

/**
 * Sehrgar holati URL'da yashaydi, ya'ni uni O'QITUVCHI qo'lda tahrirlashi,
 * eski havola yuborishi yoki brauzer yarim yo'lda to'xtatishi mumkin.
 * Shuning uchun bu testning asosiy da'vosi bitta: har qanday kirishda
 * parser throw QILMAYDI va hamisha ishlatishga yaroqli holat qaytaradi.
 *
 * Komponent render testi bu loyihada imkonsiz (vitest muhiti `node`, jsdom
 * yo'q, `include` faqat `*.test.ts`), shuning uchun sehrgarning butun
 * mantiqi shu sof modulga chiqarilgan va qoplama shu yerda.
 */

const EMPTY: WizardParams = {
  step: null,
  type: null,
  subject: null,
  grade: null,
  quarter: null,
  topicId: null,
  query: "",
  duration: null,
  questionCount: null,
  kinds: null,
  difficulty: null,
  slideCount: null,
  gameKind: null,
  itemCount: null,
};

describe("parseWizardParams — har kirish uchun xavfsiz default", () => {
  it("bo'sh searchParams hamma maydonni bo'sh qaytaradi", () => {
    expect(parseWizardParams({})).toEqual(EMPTY);
  });

  it("to'liq va to'g'ri havolani o'qiydi", () => {
    const params = parseWizardParams({
      qadam: "tasdiq",
      tur: "test",
      fan: "fizika",
      sinf: "7",
      chorak: "2",
      mavzu: "topic-1",
      q: "harakat",
      savol: "10",
      turlar: "mcq,short",
      qiyin: "hard",
    });

    expect(params).toEqual({
      step: "tasdiq",
      type: "test",
      subject: "fizika",
      grade: 7,
      quarter: 2,
      topicId: "topic-1",
      query: "harakat",
      duration: null,
      questionCount: 10,
      kinds: ["mcq", "short"],
      difficulty: "hard",
      slideCount: null,
      gameKind: null,
      itemCount: null,
    });
  });

  it.each([
    ["noma'lum qadam", { qadam: "boshqa" }, "step"],
    ["noma'lum tur", { tur: "krossvord" }, "type"],
    ["sinf chegaradan tashqari", { sinf: "99" }, "grade"],
    ["sinf manfiy", { sinf: "-3" }, "grade"],
    ["sinf matn", { sinf: "abc" }, "grade"],
    ["sinf kasr", { sinf: "7.5" }, "grade"],
    ["chorak 0", { chorak: "0" }, "quarter"],
    ["chorak 5", { chorak: "5" }, "quarter"],
    ["noma'lum qiyinlik", { qiyin: "juda-qattiq" }, "difficulty"],
    ["ro'yxatda yo'q davomiylik", { daqiqa: "37" }, "duration"],
    ["ro'yxatda yo'q savol soni", { savol: "7" }, "questionCount"],
    ["noma'lum savol turi", { turlar: "esse" }, "kinds"],
  ] as const)("%s -> null", (_label, raw, field) => {
    const params = parseWizardParams(raw);
    expect(params[field]).toBeNull();
  });

  it("eksponensial yozuv butun son sifatida qabul qilinmaydi", () => {
    // `Number("1e9")` 1000000000 beradi — agar parser `Number` ga tayansa,
    // bu chegara tekshiruvidan jimgina o'tib ketardi.
    expect(parseWizardParams({ sinf: "1e1" }).grade).toBeNull();
  });

  it("uzun mavzu id si KESILMAYDI, tashlanadi", () => {
    // Yarim kesilgan id bazada topilmaydi va "mavzu topilmadi" deb
    // chalg'itardi — yo'qligi aniqroq.
    expect(parseWizardParams({ mavzu: "x".repeat(65) }).topicId).toBeNull();
    expect(parseWizardParams({ mavzu: "x".repeat(64) }).topicId).toHaveLength(64);
  });

  it("qidiruv matni trim qilinadi va uzunligi cheklanadi", () => {
    expect(parseWizardParams({ q: "   harakat   " }).query).toBe("harakat");
    expect(parseWizardParams({ q: "a".repeat(200) }).query).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });

  it("takrorlangan maydondan birinchisini oladi", () => {
    expect(parseWizardParams({ fan: ["fizika", "kimyo"] }).subject).toBe("fizika");
  });
});

describe("turlar — ikki shaklda ham keladi", () => {
  it("takrorlangan forma maydoni (?turlar=mcq&turlar=short)", () => {
    expect(parseWizardParams({ turlar: ["mcq", "short"] }).kinds).toEqual([
      "mcq",
      "short",
    ]);
  });

  it("vergulli havola (?turlar=mcq,short)", () => {
    expect(parseWizardParams({ turlar: "mcq,short" }).kinds).toEqual([
      "mcq",
      "short",
    ]);
  });

  it("noma'lum turlar filtrlanadi, qolgani saqlanadi", () => {
    expect(parseWizardParams({ turlar: "mcq,esse,match" }).kinds).toEqual([
      "mcq",
      "match",
    ]);
  });

  it("takror va tartib normallashtiriladi", () => {
    // Round-trip uchun shart: `?turlar=short,mcq,short` va `?turlar=mcq,short`
    // bitta holat bo'lishi kerak.
    expect(parseWizardParams({ turlar: "short,mcq,short" }).kinds).toEqual([
      "mcq",
      "short",
    ]);
  });

  it("faqat noma'lum turlar -> null (default qo'llanadi)", () => {
    expect(parseWizardParams({ turlar: "esse,insho" }).kinds).toBeNull();
  });

  it("bo'sh bo'laklar tashlanadi", () => {
    expect(parseWizardParams({ turlar: ",mcq,," }).kinds).toEqual(["mcq"]);
  });
});

describe("paramsCompleteForType", () => {
  it("tur yo'q -> to'liq emas", () => {
    expect(paramsCompleteForType(EMPTY)).toBe(false);
  });

  it("dars: faqat davomiylik kerak", () => {
    expect(paramsCompleteForType({ ...EMPTY, type: "dars" })).toBe(false);
    expect(paramsCompleteForType({ ...EMPTY, type: "dars", duration: 45 })).toBe(
      true,
    );
  });

  it("test: uchala parametr kerak", () => {
    const base = { ...EMPTY, type: "test" } as WizardParams;
    expect(paramsCompleteForType(base)).toBe(false);
    expect(paramsCompleteForType({ ...base, questionCount: 10 })).toBe(false);
    expect(
      paramsCompleteForType({ ...base, questionCount: 10, kinds: ["mcq"] }),
    ).toBe(false);
    expect(
      paramsCompleteForType({
        ...base,
        questionCount: 10,
        kinds: ["mcq"],
        difficulty: "mixed",
      }),
    ).toBe(true);
  });

  it("bo'sh turlar massivi to'liq hisoblanmaydi", () => {
    expect(
      paramsCompleteForType({
        ...EMPTY,
        type: "test",
        questionCount: 10,
        kinds: [],
        difficulty: "mixed",
      }),
    ).toBe(false);
  });
});

describe("inferStep — zinapoya", () => {
  it("tur yo'q -> tur qadami", () => {
    expect(inferStep(EMPTY, { topicResolved: false })).toBe("tur");
  });

  it("tur bor, mavzu hal qilinmagan -> mavzu qadami", () => {
    expect(inferStep({ ...EMPTY, type: "dars" }, { topicResolved: false })).toBe(
      "mavzu",
    );
  });

  it("mavzu hal qilingan, parametr yo'q -> param qadami", () => {
    expect(inferStep({ ...EMPTY, type: "dars" }, { topicResolved: true })).toBe(
      "param",
    );
  });

  it("hammasi bor -> tasdiq qadami", () => {
    expect(
      inferStep({ ...EMPTY, type: "dars", duration: 45 }, { topicResolved: true }),
    ).toBe("tasdiq");
  });

  it("MAVZU YOLG'IZ O'ZI YETARLI: fan va sinf TALAB QILINMAYDI", () => {
    // Bu regressiya testi. `FAILED` hujjatdan qurilgan "Qaytadan yaratish"
    // havolasi fan va sinfni BILMAYDI (hujjatda faqat topicId bor). Agar
    // inferStep ularni talab qilsa, o'sha havola `mavzu` qadamiga qaytib
    // tushardi va bitta bosishda qayta urinish ishlamasdi.
    const retry: WizardParams = {
      ...EMPTY,
      type: "dars",
      topicId: "topic-1",
      duration: 45,
      subject: null,
      grade: null,
    };
    expect(inferStep(retry, { topicResolved: true })).toBe("tasdiq");
  });

  it("eski havola (?fan&sinf&chorak&mavzu, tur yo'q) -> tur qadami", () => {
    // `app/[locale]/ish/page.tsx` va `rejam/page.tsx` aynan shu shaklni
    // yuboradi — `tur` bermaydi. Mavzu keyingi qadamlarda saqlanishi kerak.
    const params = parseWizardParams({
      fan: "fizika",
      sinf: "7",
      chorak: "2",
      mavzu: "topic-1",
    });
    expect(inferStep(params, { topicResolved: true })).toBe("tur");
    expect(wizardQuery(params).mavzu).toBe("topic-1");
  });
});

describe("resolveStep — orqaga erkin, oldinga cheklangan", () => {
  it("so'ralmagan bo'lsa hisoblangani", () => {
    expect(resolveStep(null, "param")).toBe("param");
  });

  it("orqaga qaytish ruxsat", () => {
    expect(resolveStep("tur", "tasdiq")).toBe("tur");
    expect(resolveStep("mavzu", "param")).toBe("mavzu");
  });

  it("joriy qadamning o'zi ruxsat", () => {
    expect(resolveStep("param", "param")).toBe("param");
  });

  it("oldinga sakrash rad etiladi", () => {
    // `?qadam=tasdiq` bilan mavzusiz tasdiqlash ekraniga tushsa, "Yaratish"
    // tugmasi `"invalid"` qaytarardi.
    expect(resolveStep("tasdiq", "mavzu")).toBe("mavzu");
    expect(resolveStep("param", "tur")).toBe("tur");
  });
});

describe("previousStep", () => {
  it("birinchi qadamdan orqaga yo'q", () => {
    expect(previousStep("tur")).toBeNull();
  });

  it("qolganlari ketma-ket", () => {
    expect(previousStep("mavzu")).toBe("tur");
    expect(previousStep("param")).toBe("mavzu");
    expect(previousStep("tasdiq")).toBe("param");
  });
});

describe("resolveParams — default bilan to'ldirish", () => {
  it("tur yo'q bo'lsa dars ishlanma deb hisoblanadi", () => {
    expect(resolveParams(EMPTY)).toEqual({
      type: "LESSON_PLAN",
      durationMinutes: DEFAULT_DURATION,
    });
  });

  it("test uchun uchala default", () => {
    expect(resolveParams({ ...EMPTY, type: "test" })).toEqual({
      type: "TEST",
      questionCount: DEFAULT_QUESTION_COUNT,
      kinds: DEFAULT_KINDS,
      difficulty: DEFAULT_DIFFICULTY,
    });
  });

  it("tanlangan qiymat default'dan ustun", () => {
    expect(resolveParams({ ...EMPTY, type: "dars", duration: 90 })).toEqual({
      type: "LESSON_PLAN",
      durationMinutes: 90,
    });
  });
});

describe("startInputFor — server sxemasiga mos", () => {
  it("dars ishlanma: default qiymat ham sxemadan o'tadi", () => {
    const input = startInputFor({ ...EMPTY, type: "dars" }, "topic-1");
    expect(input).toEqual({
      type: "LESSON_PLAN",
      topicId: "topic-1",
      durationMinutes: DEFAULT_DURATION,
    });
    expect(startSchema.safeParse(input).success).toBe(true);
  });

  it("test: default qiymat ham sxemadan o'tadi", () => {
    const input = startInputFor({ ...EMPTY, type: "test" }, "topic-1");
    expect(startSchema.safeParse(input).success).toBe(true);
  });

  it("HAR BIR davomiylik varianti sxemadan o'tadi", () => {
    // Variant ro'yxati va server validatsiyasi ikki xil joyda yashaydi;
    // bu test ularni bog'laydi. Aks holda formaga `startSchema` rad
    // etadigan son qo'shilsa, xato faqat o'qituvchi bosganda chiqardi.
    for (const duration of DURATIONS) {
      const input = startInputFor(
        { ...EMPTY, type: "dars", duration },
        "topic-1",
      );
      expect(startSchema.safeParse(input).success, `daqiqa=${duration}`).toBe(
        true,
      );
    }
  });

  it("HAR BIR savol soni varianti sxemadan o'tadi", () => {
    for (const count of QUESTION_COUNTS) {
      const input = startInputFor(
        { ...EMPTY, type: "test", questionCount: count },
        "topic-1",
      );
      expect(startSchema.safeParse(input).success, `savol=${count}`).toBe(true);
    }
  });

  it("variant ro'yxatlari server chegaralari ichida", () => {
    for (const duration of DURATIONS) {
      expect(duration).toBeGreaterThanOrEqual(MIN_DURATION);
      expect(duration).toBeLessThanOrEqual(MAX_DURATION);
    }
    for (const count of QUESTION_COUNTS) {
      expect(count).toBeGreaterThanOrEqual(UNIT_LIMITS.TEST.min);
      expect(count).toBeLessThanOrEqual(UNIT_LIMITS.TEST.max);
    }
    expect(QUESTION_COUNTS.length).toBeGreaterThan(0);
  });

  it("HAR BIR savol turi kombinatsiyasi sxemadan o'tadi", () => {
    for (const kind of QUESTION_KINDS) {
      const input = startInputFor(
        { ...EMPTY, type: "test", questionCount: 10, kinds: [kind] },
        "topic-1",
      );
      expect(startSchema.safeParse(input).success, kind).toBe(true);
    }
  });
});

describe("wizardQuery", () => {
  it("bo'sh qiymatlar query'ga tushmaydi", () => {
    expect(wizardQuery(EMPTY)).toEqual({});
  });

  it("override qiymatni almashtiradi", () => {
    const params = { ...EMPTY, type: "dars" } as WizardParams;
    expect(wizardQuery(params, { qadam: "mavzu" })).toEqual({
      tur: "dars",
      qadam: "mavzu",
    });
  });

  it("null override kalitni O'CHIRADI", () => {
    // Chorak filtrini tozalash havolasi aynan shunday quriladi.
    const params = { ...EMPTY, type: "dars", quarter: 2 } as WizardParams;
    expect(wizardQuery(params, { chorak: null })).toEqual({ tur: "dars" });
  });

  it("turlar vergul bilan birlashtiriladi", () => {
    const params = {
      ...EMPTY,
      type: "test",
      kinds: ["mcq", "short"],
    } as WizardParams;
    expect(wizardQuery(params).turlar).toBe("mcq,short");
  });

  it("round-trip: parseWizardParams(wizardQuery(p)) === p", () => {
    const original = parseWizardParams({
      qadam: "tasdiq",
      tur: "test",
      fan: "fizika",
      sinf: "7",
      chorak: "3",
      mavzu: "topic-9",
      q: "issiqlik",
      savol: "20",
      turlar: "mcq,match",
      qiyin: "easy",
    });
    expect(parseWizardParams(wizardQuery(original))).toEqual(original);
  });

  it("round-trip: dars ishlanma holati", () => {
    const original = parseWizardParams({
      tur: "dars",
      mavzu: "topic-2",
      daqiqa: "90",
      qadam: "param",
    });
    expect(parseWizardParams(wizardQuery(original))).toEqual(original);
  });
});

describe("confirmQuery — 'Davom etish' default'ni URL'ga yozadi", () => {
  it("dars: hal qilingan davomiylik yoziladi va qadam tasdiqqa o'tadi", () => {
    const query = confirmQuery({ ...EMPTY, type: "dars" });
    expect(query).toEqual({
      tur: "dars",
      qadam: "tasdiq",
      daqiqa: String(DEFAULT_DURATION),
    });
    // Shundan keyin qadam mashinasi tasdiqqa ruxsat beradi.
    const next = parseWizardParams(query);
    expect(inferStep(next, { topicResolved: true })).toBe("tasdiq");
  });

  it("test: uchala parametr yoziladi, daqiqa tushib qoladi", () => {
    const query = confirmQuery({ ...EMPTY, type: "test", duration: 45 });
    expect(query.savol).toBe(String(DEFAULT_QUESTION_COUNT));
    expect(query.turlar).toBe(DEFAULT_KINDS.join(","));
    expect(query.qiyin).toBe(DEFAULT_DIFFICULTY);
    expect(query.daqiqa).toBeUndefined();
    expect(
      inferStep(parseWizardParams(query), { topicResolved: true }),
    ).toBe("tasdiq");
  });
});

describe("toggleKind", () => {
  it("yo'q turni qo'shadi", () => {
    expect(toggleKind(["mcq"], "match")).toEqual(["mcq", "match"]);
  });

  it("bor turni olib tashlaydi", () => {
    expect(toggleKind(["mcq", "short"], "mcq")).toEqual(["short"]);
  });

  it("OXIRGI turni olib tashlamaydi", () => {
    // `startSchema` da `.min(1)` bor: bo'sh ro'yxat `"invalid"` qaytarardi
    // va o'qituvchi nega ekanini tushunmasdi.
    expect(toggleKind(["mcq"], "mcq")).toEqual(["mcq"]);
  });

  it("null holatda default'dan boshlaydi", () => {
    expect(toggleKind(null, "match")).toEqual([...DEFAULT_KINDS, "match"]);
    expect(toggleKind(null, "mcq")).toEqual(
      DEFAULT_KINDS.filter((kind) => kind !== "mcq"),
    );
  });

  it("natija tartibi QUESTION_KINDS bo'yicha normallashgan", () => {
    // Round-trip uchun shart (parser ham shu tartibga keltiradi).
    const result = toggleKind(["match"], "mcq");
    expect(result).toEqual(
      QUESTION_KINDS.filter((kind) => result.includes(kind)),
    );
  });

  it("natija hamisha startSchema dan o'tadi", () => {
    let kinds: QuestionKind[] | null = null;
    for (const kind of [...QUESTION_KINDS, ...QUESTION_KINDS]) {
      kinds = toggleKind(kinds, kind);
      const input = startInputFor(
        { ...EMPTY, type: "test", questionCount: 10, kinds },
        "topic-1",
      );
      expect(startSchema.safeParse(input).success, kinds.join(",")).toBe(true);
    }
  });
});

describe("wizardQueryFromDocument — yiqilgan hujjatdan qayta urinish", () => {
  it("dars ishlanma: davomiylik saqlanadi, qadam tasdiq", () => {
    const query = wizardQueryFromDocument({
      type: "LESSON_PLAN",
      topicId: "topic-1",
      inputParams: { durationMinutes: 90, contextChunkIds: [] },
    });
    expect(query).toEqual({
      qadam: "tasdiq",
      tur: "dars",
      mavzu: "topic-1",
      daqiqa: "90",
    });
    expect(
      inferStep(parseWizardParams(query), { topicResolved: true }),
    ).toBe("tasdiq");
  });

  it("test: uchala parametr saqlanadi", () => {
    const query = wizardQueryFromDocument({
      type: "TEST",
      topicId: "topic-2",
      inputParams: {
        questionCount: 20,
        kinds: ["mcq", "match"],
        difficulty: "hard",
      },
    });
    expect(query).toEqual({
      qadam: "tasdiq",
      tur: "test",
      mavzu: "topic-2",
      savol: "20",
      turlar: "mcq,match",
      qiyin: "hard",
    });
  });

  it("fan va sinf BERILMAYDI (hujjatda ular yo'q)", () => {
    const query = wizardQueryFromDocument({
      type: "LESSON_PLAN",
      topicId: "topic-1",
      inputParams: { durationMinutes: 45 },
    });
    expect(query.fan).toBeUndefined();
    expect(query.sinf).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["satr", "buzuq"],
    ["bo'sh obyekt", {}],
    ["noto'g'ri turlar", { questionCount: 10, kinds: ["esse"] }],
    ["ro'yxatda yo'q savol soni", { questionCount: 7 }],
    ["ro'yxatda yo'q davomiylik", { durationMinutes: 37 }],
  ] as const)("buzuq inputParams (%s) da ham havola ishlaydi", (_label, input) => {
    const query = wizardQueryFromDocument({
      type: "TEST",
      topicId: "topic-3",
      inputParams: input,
    });
    // Tur va mavzu hamisha bor — eng yomoni, o'qituvchi parametrlarni
    // qaytadan tanlaydi (qadam `param` ga tushadi).
    expect(query.tur).toBe("test");
    expect(query.mavzu).toBe("topic-3");
    const params = parseWizardParams(query);
    expect(WIZARD_STEPS).toContain(inferStep(params, { topicResolved: true }));
  });

  it("parametrlar o'qilmasa qadam param ga tushadi, tasdiqqa emas", () => {
    const query = wizardQueryFromDocument({
      type: "TEST",
      topicId: "topic-3",
      inputParams: {},
    });
    expect(
      inferStep(parseWizardParams(query), { topicResolved: true }),
    ).toBe("param");
  });
});

/* ------------------------------------------------------------------ */
/* SLIDES turi (14-sessiya)                                           */
/* ------------------------------------------------------------------ */

describe("taqdimot — sehrgar holati", () => {
  it("?tur=taqdimot&slayd=12 round-trip dan o'tadi", () => {
    const params = parseWizardParams({ tur: "taqdimot", slayd: "12" });
    expect(params.type).toBe("taqdimot");
    expect(params.slideCount).toBe(12);
    expect(wizardQuery(params)).toEqual({ tur: "taqdimot", slayd: "12" });
  });

  it("ro'yxatda yo'q son TASHLANADI", () => {
    // 11 — `UNIT_LIMITS.SLIDES` ichida, lekin formadagi variant emas.
    // Narx faqat ro'yxatdagi sonlar uchun ko'rsatiladi, boshqasi
    // "narxsiz" holat yasardi.
    expect(parseWizardParams({ slayd: "11" }).slideCount).toBeNull();
    expect(parseWizardParams({ slayd: "100" }).slideCount).toBeNull();
    expect(parseWizardParams({ slayd: "salom" }).slideCount).toBeNull();
  });

  it("paramsCompleteForType: faqat slayd soni kerak", () => {
    expect(paramsCompleteForType({ ...EMPTY, type: "taqdimot" })).toBe(false);
    expect(
      paramsCompleteForType({ ...EMPTY, type: "taqdimot", slideCount: 12 }),
    ).toBe(true);
  });

  it("paramsCompleteForType taqdimotni DARS tarmog'iga tushirmaydi", () => {
    // Jim nuqsonning aynan o'zi: `if (TEST) ... else LESSON_PLAN` shaklida
    // bu holat `duration !== null` ni tekshirib, `true` qaytarardi va
    // o'qituvchi slayd sonini umuman ko'rmasdan tasdiqlash ekraniga tushardi.
    expect(
      paramsCompleteForType({ ...EMPTY, type: "taqdimot", duration: 45 }),
    ).toBe(false);
  });

  it("resolveParams default slayd sonini beradi", () => {
    expect(resolveParams({ ...EMPTY, type: "taqdimot" })).toEqual({
      type: "SLIDES",
      slideCount: DEFAULT_SLIDE_COUNT,
    });
  });

  it("startInputFor: default ham sxemadan o'tadi", () => {
    const input = startInputFor({ ...EMPTY, type: "taqdimot" }, "topic-1");
    expect(input).toEqual({
      type: "SLIDES",
      topicId: "topic-1",
      slideCount: DEFAULT_SLIDE_COUNT,
    });
    expect(startSchema.safeParse(input).success).toBe(true);
  });

  it("HAR BIR slayd soni varianti sxemadan o'tadi", () => {
    for (const count of SLIDE_COUNTS) {
      const input = startInputFor(
        { ...EMPTY, type: "taqdimot", slideCount: count },
        "topic-1",
      );
      expect(startSchema.safeParse(input).success, `slayd=${String(count)}`).toBe(true);
    }
  });

  it("variant ro'yxati server chegaralari ichida", () => {
    for (const count of SLIDE_COUNTS) {
      expect(count).toBeGreaterThanOrEqual(UNIT_LIMITS.SLIDES.min);
      expect(count).toBeLessThanOrEqual(UNIT_LIMITS.SLIDES.max);
    }
    expect(SLIDE_COUNTS.length).toBeGreaterThan(0);
    expect(SLIDE_COUNTS).toContain(DEFAULT_SLIDE_COUNT);
  });

  it("confirmQuery slayd sonini yozadi va BOSHQA turning parametrlarini tozalaydi", () => {
    const params = parseWizardParams({
      tur: "taqdimot",
      // Dars va test parametrlari eski havoladan qolib ketgan.
      daqiqa: "45",
      savol: "10",
      turlar: "mcq",
      qiyin: "mixed",
    });
    const query = confirmQuery(params);
    expect(query.slayd).toBe(String(DEFAULT_SLIDE_COUNT));
    expect(query.daqiqa).toBeUndefined();
    expect(query.savol).toBeUndefined();
    expect(query.turlar).toBeUndefined();
    expect(query.qiyin).toBeUndefined();
  });

  it("dars va test confirmQuery si slayd sonini tozalaydi", () => {
    const lesson = confirmQuery(parseWizardParams({ tur: "dars", slayd: "12" }));
    expect(lesson.slayd).toBeUndefined();
    const test = confirmQuery(parseWizardParams({ tur: "test", slayd: "12" }));
    expect(test.slayd).toBeUndefined();
  });

  it("wizardQueryFromDocument saqlangan slayd sonini qaytaradi", () => {
    const query = wizardQueryFromDocument({
      type: "SLIDES",
      topicId: "t-1",
      inputParams: { slideCount: 14, contextChunkIds: [] },
    });
    expect(query).toEqual({
      qadam: "tasdiq",
      tur: "taqdimot",
      mavzu: "t-1",
      slayd: "14",
    });
  });

  it("wizardQueryFromDocument ro'yxatda yo'q sonni tashlaydi", () => {
    const query = wizardQueryFromDocument({
      type: "SLIDES",
      topicId: "t-1",
      inputParams: { slideCount: 11 },
    });
    expect(query.slayd).toBeUndefined();
    // Qolgani saqlanadi — qadam `param` ga tushadi va o'qituvchi qaytadan tanlaydi.
    expect(query.tur).toBe("taqdimot");
  });
});
