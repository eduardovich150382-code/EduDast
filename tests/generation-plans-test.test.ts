import { describe, expect, it } from "vitest";
import { Block, DocumentContent } from "@/lib/documents/blocks";
import { stagePurpose, type StageSpec } from "@/lib/generation/plans";
import {
  bloomTargets,
  buildTestPlan,
  checkBlueprint,
  checkTestQuestions,
  TEST_SPLIT_THRESHOLD,
  TestBlueprintOut,
  TestClosingOut,
  TestQuestionsOut,
  testBlueprintBlocks,
  testClosingBlocks,
  testQuestionBlocks,
  testStageInstruction,
} from "@/lib/generation/plans-test";

/**
 * `TEST` konveyerining bosqich rejasi — 10-sessiya.
 *
 * ENG MUHIM BLOK — "bloklarga o'girish": LLM sxemasi `options` va `pairs`
 * ni MAJBURIY massiv deb oladi (ixtiyoriy maydon Gemini zanjirida
 * yiqiladi), blok sxemasi esa `match` dan boshqa turda `pairs` ning
 * BO'LMASLIGINI talab qiladi. Bo'sh massiv ham "berilgan" hisoblanadi,
 * ya'ni o'girgich maydonni tashlab ketishi shart. Birinchi yiqiladigan
 * joy aynan shu.
 */

const BLUEPRINT: TestBlueprintOut = {
  title: "Tezlanish — nazorat testi",
  objectives: ["Tezlanishni ta'riflaydi", "Tezlanishni hisoblaydi"],
  items: [
    { objective: "Tezlanishni ta'riflaydi", count: 4, bloom: "remember" },
    { objective: "Tezlanishni hisoblaydi", count: 6, bloom: "apply" },
  ],
};

const CLOSING: TestClosingOut = {
  rubric: {
    criteria: [
      { name: "Formulani qo'llash", maxPoints: 2, descriptors: ["To'liq to'g'ri"] },
      { name: "Birliklar", maxPoints: 1, descriptors: ["Birlik ko'rsatilgan"] },
    ],
  },
  notes: [{ tone: "tip", text: "Testni 25 daqiqada o'tkazish tavsiya etiladi." }],
};

/** LLM chiqishidagi bitta savol — turga qarab maydonlari to'ldiriladi. */
function question(overrides: Partial<TestQuestionsOut["questions"][number]> = {}) {
  return {
    kind: "mcq" as const,
    text: "Tezlanishning o'lchov birligi qaysi?",
    options: ["m/s^2", "m/s", "N/kg", "kg*m"],
    pairs: [],
    answer: "m/s^2",
    explanation: "Tezlanish tezlikning vaqtga nisbati.",
    points: 1,
    bloom: "remember" as const,
    ...overrides,
  };
}

const SPEC: StageSpec = { id: "2", kind: "content", range: { from: 0, to: 10 } };

describe("buildTestPlan", () => {
  it("20 tagacha savol — uch bosqich (sessiya hujjatidagi reja)", () => {
    const plan = buildTestPlan(10);
    expect(plan.stages.map((stage) => stage.id)).toEqual(["1", "2", "3"]);
    expect(plan.stages[1]?.range).toEqual({ from: 0, to: 10 });
  });

  it("chegarada hali bo'linmaydi", () => {
    expect(buildTestPlan(TEST_SPLIT_THRESHOLD).stages).toHaveLength(3);
  });

  it("chegaradan oshsa savollar 2a/2b ga bo'linadi", () => {
    // NEGA: 40 savol bitta javobda Vercel'ning 60 soniyalik shiftiga
    // urilardi — `buildPlan` dagi bo'linish bilan bir xil sabab.
    const plan = buildTestPlan(24);
    expect(plan.stages.map((stage) => stage.id)).toEqual(["1", "2a", "2b", "3"]);
    expect(plan.stages[1]?.range).toEqual({ from: 0, to: 12 });
    expect(plan.stages[2]?.range).toEqual({ from: 12, to: 24 });
  });

  it("bo'linishda birorta savol tushib qolmaydi va takrorlanmaydi", () => {
    for (const count of [21, 25, 33, 40]) {
      const ranges = buildTestPlan(count)
        .stages.filter((stage) => stage.kind === "content")
        .map((stage) => stage.range!);
      expect(ranges[0]?.from).toBe(0);
      expect(ranges.at(-1)?.to).toBe(count);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i]?.from).toBe(ranges[i - 1]?.to);
      }
    }
  });

  it("purpose dars ishlanmadan AJRALADI — marja tahlili uchun", () => {
    const plan = buildTestPlan(24);
    expect(plan.stages.map((spec) => stagePurpose(spec, "test"))).toEqual([
      "test:stage-1",
      "test:stage-2a",
      "test:stage-2b",
      "test:stage-3",
    ]);
  });
});

describe("arzon darvozalar", () => {
  it("blueprint yig'indisi so'ralgan songa teng bo'lsa o'tadi", () => {
    expect(checkBlueprint(BLUEPRINT, 10)).toEqual({ ok: true });
  });

  it("yig'indi mos kelmasa TO'XTATADI — ikki qimmat chaqiruv tejaladi", () => {
    const gate = checkBlueprint(BLUEPRINT, 12);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toContain("10");
  });

  it("savol soni mos kelmasa to'xtatadi", () => {
    const gate = checkTestQuestions({ questions: [question()] }, { expected: 2, kinds: ["mcq"] });
    expect(gate.ok).toBe(false);
  });

  it("ruxsat etilmagan tur to'xtatadi", () => {
    // O'qituvchi faqat mcq so'ragan bo'lsa, model qo'shgan truefalse
    // savoli so'ralmagan mahsulot.
    const out = { questions: [question({ kind: "truefalse", options: [], answer: "to'g'ri" })] };
    const gate = checkTestQuestions(out, { expected: 1, kinds: ["mcq"] });
    expect(gate.ok).toBe(false);
  });

  it("match juftligi yetarli bo'lmasa to'xtatadi", () => {
    const out = {
      questions: [
        question({
          kind: "match",
          options: [],
          pairs: [{ left: "Tezlanish", right: "m/s^2" }],
          answer: "Tezlanish - m/s^2",
        }),
      ],
    };
    expect(checkTestQuestions(out, { expected: 1, kinds: ["match"] }).ok).toBe(false);
  });

  it("mcq javobi variantlar ichida bo'lmasa to'xtatadi", () => {
    const out = { questions: [question({ answer: "kg" })] };
    expect(checkTestQuestions(out, { expected: 1, kinds: ["mcq"] }).ok).toBe(false);
  });
});

describe("bloklarga o'girish", () => {
  it.each([
    ["mcq", question()],
    ["short", question({ kind: "short", options: [], answer: "a = (v - v0) / t" })],
    ["truefalse", question({ kind: "truefalse", options: [], answer: "to'g'ri" })],
    [
      "match",
      question({
        kind: "match",
        options: [],
        pairs: [
          { left: "Tezlanish", right: "m/s^2" },
          { left: "Tezlik", right: "m/s" },
        ],
        answer: "Tezlanish - m/s^2",
      }),
    ],
  ])("%s savoli blok sxemasidan o'tadi", (_kind, item) => {
    const blocks = testQuestionBlocks(SPEC, { questions: [item] });
    for (const block of blocks) {
      const parsed = Block.safeParse(block);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("match dan BOSHQA turda pairs maydoni UMUMAN qo'yilmaydi", () => {
    // Bo'sh massiv ham blok sxemasini yiqitadi — shuning uchun maydon
    // bo'lmasligi KERAK, bo'sh bo'lishi yetmaydi.
    const blocks = testQuestionBlocks(SPEC, { questions: [question()] });
    expect(Object.hasOwn(blocks[0]!, "pairs")).toBe(false);
  });

  it("match da options bo'sh qoladi, pairs to'ldiriladi", () => {
    const pairs = [
      { left: "Tezlanish", right: "m/s^2" },
      { left: "Tezlik", right: "m/s" },
    ];
    const blocks = testQuestionBlocks(SPEC, {
      questions: [question({ kind: "match", options: ["eski"], pairs, answer: "x" })],
    });
    const block = blocks[0]!;
    expect(block.type === "question" && block.options).toEqual([]);
    expect(block.type === "question" && block.pairs).toEqual(pairs);
  });

  it("javoblar kaliti SAVOLDAN quriladi — nomuvofiqlik imkonsiz", () => {
    const items = [question(), question({ kind: "short", options: [], answer: "9,8 m/s^2" })];
    const blocks = testQuestionBlocks(SPEC, { questions: items });
    const key = blocks.at(-1)!;
    expect(key.type).toBe("answerKey");
    if (key.type !== "answerKey") throw new Error("kalit bloki yo'q");

    const questionIds = blocks.filter((b) => b.type === "question").map((b) => b.id);
    expect(key.items.map((item) => item.questionId)).toEqual(questionIds);
    expect(key.items.map((item) => item.answer)).toEqual(items.map((item) => item.answer));
  });

  it("bosqich id si blok id lariga kiradi — 2a va 2b to'qnashmaydi", () => {
    const a = testQuestionBlocks({ id: "2a", kind: "content" }, { questions: [question()] });
    const b = testQuestionBlocks({ id: "2b", kind: "content" }, { questions: [question()] });
    const ids = [...a, ...b].map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("bir hujjatdagi hamma blok DocumentContent dan o'tadi", () => {
    const blueprint = testBlueprintBlocks({ id: "1", kind: "skeleton" }, BLUEPRINT);
    const closing = testClosingBlocks({ id: "3", kind: "closing" }, CLOSING);
    const content = {
      v: 1 as const,
      blocks: [
        ...blueprint,
        ...testQuestionBlocks({ id: "2a", kind: "content" }, { questions: [question()] }),
        ...testQuestionBlocks({ id: "2b", kind: "content" }, { questions: [question()] }),
        ...closing,
      ],
    };
    const parsed = DocumentContent.safeParse(content);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});


describe("bosqich ko'rsatmalari", () => {
  it("1-bosqich savol sonini talab qiladi, savollarni so'ramaydi", () => {
    const text = testStageInstruction({ id: "1", kind: "skeleton" }, {
      questionCount: 10,
      kinds: ["mcq"],
      blueprint: null,
    });
    expect(text).toContain("BLUEPRINT");
    expect(text).toContain("10");
  });

  it("blueprint'siz mazmun bosqichi THROW qiladi", () => {
    // Jim davom etsa model kontekstsiz savol yozib, pul sarflanardi.
    expect(() =>
      testStageInstruction(SPEC, { questionCount: 10, kinds: ["mcq"], blueprint: null }),
    ).toThrow();
  });

  it("mazmun bosqichi faqat O'Z oralig'ini so'raydi", () => {
    const text = testStageInstruction(
      { id: "2b", kind: "content", range: { from: 12, to: 24 } },
      { questionCount: 24, kinds: ["mcq", "short"], blueprint: BLUEPRINT },
    );
    expect(text).toContain("13-24");
    expect(text).toContain("12 ta savol");
  });

  it("yakuniy bosqich rubrika so'raydi", () => {
    const text = testStageInstruction({ id: "3", kind: "closing" }, {
      questionCount: 10,
      kinds: ["mcq"],
      blueprint: BLUEPRINT,
    });
    expect(text).toContain("rubrika");
  });
});

describe("bloomTargets", () => {
  it("blueprint bandlarini daraja bo'yicha yig'adi", () => {
    expect(bloomTargets(BLUEPRINT.items)).toEqual({ remember: 4, apply: 6 });
  });

  it("bir daraja bir necha bandda uchrasa qo'shiladi", () => {
    const targets = bloomTargets([
      { bloom: "remember", count: 2 },
      { bloom: "remember", count: 3 },
    ]);
    expect(targets).toEqual({ remember: 5 });
  });

  it("bo'sh ro'yxat bo'sh natija beradi — tekshiruv o'tkazilmaydi", () => {
    expect(bloomTargets([])).toEqual({});
  });
});

describe("LLM sxemalarining intizomi", () => {
  /**
   * Sxemalar TEKIS bo'lishi SHART: `$ref`/`oneOf` Gemini zanjirida
   * jimgina yiqiladi (`plans.ts` dagi ogohlantirish).
   */
  it("savol sxemasi options va pairs ni MAJBURIY deb oladi", () => {
    const withoutPairs = { ...question() } as Record<string, unknown>;
    delete withoutPairs.pairs;
    expect(TestQuestionsOut.safeParse({ questions: [withoutPairs] }).success).toBe(false);

    const withoutOptions = { ...question() } as Record<string, unknown>;
    delete withoutOptions.options;
    expect(TestQuestionsOut.safeParse({ questions: [withoutOptions] }).success).toBe(false);
  });

  it("bo'sh massivlar esa ruxsat etiladi", () => {
    const out = { questions: [question({ kind: "short", options: [], answer: "9,8" })] };
    expect(TestQuestionsOut.safeParse(out).success).toBe(true);
  });

  it("sxemada yo'q maydon rad etiladi", () => {
    expect(TestBlueprintOut.safeParse({ ...BLUEPRINT, qoshimcha: 1 }).success).toBe(false);
    expect(TestClosingOut.safeParse({ ...CLOSING, qoshimcha: 1 }).success).toBe(false);
  });

  it("bitta bosqich bir marta so'raydigan savol soni cheklangan", () => {
    // 60 soniyalik shift: bitta javobda cheksiz savol so'rab bo'lmaydi.
    const many = Array.from({ length: TEST_SPLIT_THRESHOLD + 1 }, () => question());
    expect(TestQuestionsOut.safeParse({ questions: many }).success).toBe(false);
  });
});
