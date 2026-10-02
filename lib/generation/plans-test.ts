import { z } from "zod";
import { blockId, BLOOM, type Block, type BloomLevel } from "@/lib/documents/blocks";
import { QUESTION_KINDS, type QuestionKind } from "./prompts";
import type { GenerationPlan, SkeletonGate, StageSpec } from "./plans";

/**
 * `TEST` konveyerining bosqich rejasi (10-sessiya).
 *
 * `lib/generation/plans.ts` ning AYNAN naqshi va ayni intizomi — bu fayl
 * ikkinchi hujjat turining butun o'ziga xosligini bir joyda tutadi, konveyer
 * esa (kursor, ijara, `commitStage`, kredit) o'zgarishsiz qoladi.
 *
 * Dars ishlanmadan BITTA MUHIM FARQI: `total` boshidan ANIQ. Savol soni
 * o'qituvchi formada tanlagan parametr, ya'ni reja hujjat yaratilgan paytda
 * hisoblanadi; dars ishlanmada esa u 1-bosqich natijasidan kelib chiqadi.
 */

/**
 * Shundan ko'p savol so'ralsa savollar ikkiga bo'linadi.
 *
 * NEGA: 40 savolni bitta javobda yozish Vercel Hobby'ning 60 soniyalik
 * shiftiga urilardi — `plans.ts:SPLIT_THRESHOLD` bilan bir xil sabab.
 * Sessiya hujjatidagi uch bosqichli reja 20 tagacha savolda aynan shunday
 * qoladi, bo'linish faqat katta testda yuz beradi.
 */
export const TEST_SPLIT_THRESHOLD = 20;

export function buildTestPlan(questionCount: number): GenerationPlan {
  const blueprint: StageSpec = { id: "1", kind: "skeleton" };
  const closing: StageSpec = { id: "3", kind: "closing" };

  if (questionCount <= TEST_SPLIT_THRESHOLD) {
    return {
      stages: [
        blueprint,
        { id: "2", kind: "content", range: { from: 0, to: questionCount } },
        closing,
      ],
    };
  }

  const half = Math.ceil(questionCount / 2);
  return {
    stages: [
      blueprint,
      { id: "2a", kind: "content", range: { from: 0, to: half } },
      { id: "2b", kind: "content", range: { from: half, to: questionCount } },
      closing,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Bosqich chiqish sxemalari                                           */
/* ------------------------------------------------------------------ */

/**
 * DIQQAT — `plans.ts:78-84` dagi ogohlantirish bu yerga ham to'liq tegishli:
 * sxemalar TEKIS, `id` maydoni yo'q, discriminated union yo'q, IXTIYORIY
 * MAYDON YO'Q.
 *
 * Shuning uchun `options` va `pairs` IKKALASI HAM majburiy massiv: savol
 * turiga kerak bo'lmagani bo'sh massiv bo'lib keladi. Blok sxemasi esa
 * `match` dan boshqa turda `pairs` ning BO'LMASLIGINI talab qiladi (bo'sh
 * massiv ham "berilgan" hisoblanadi) — maydonni `testQuestionBlocks`
 * tashlab ketadi.
 */

const BlueprintItem = z.strictObject({
  objective: z.string().min(3).max(300),
  count: z.number().int().min(1).max(40),
  bloom: z.enum(BLOOM),
});

export const TestBlueprintOut = z.strictObject({
  title: z.string().min(3).max(200),
  objectives: z.array(z.string().min(3).max(300)).min(2).max(8),
  items: z.array(BlueprintItem).min(1).max(8),
});
export type TestBlueprintOut = z.infer<typeof TestBlueprintOut>;

export const TestQuestionsOut = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        kind: z.enum(QUESTION_KINDS),
        text: z.string().min(10).max(1_000),
        options: z.array(z.string().min(1).max(300)).max(8),
        pairs: z
          .array(z.strictObject({ left: z.string().min(1).max(200), right: z.string().min(1).max(200) }))
          .max(10),
        answer: z.string().min(1).max(500),
        explanation: z.string().min(5).max(1_000),
        points: z.number().int().min(1).max(20),
        bloom: z.enum(BLOOM),
      }),
    )
    .min(1)
    .max(TEST_SPLIT_THRESHOLD),
});
export type TestQuestionsOut = z.infer<typeof TestQuestionsOut>;

export const TestClosingOut = z.strictObject({
  rubric: z.strictObject({
    criteria: z
      .array(
        z.strictObject({
          name: z.string().min(3).max(120),
          maxPoints: z.number().int().min(1).max(20),
          descriptors: z.array(z.string().min(3).max(300)).min(1).max(4),
        }),
      )
      .min(2)
      .max(5),
  }),
  notes: z
    .array(
      z.strictObject({
        tone: z.enum(["info", "warning", "tip"]),
        text: z.string().min(10).max(1_000),
      }),
    )
    .min(1)
    .max(4),
});
export type TestClosingOut = z.infer<typeof TestClosingOut>;

/* ------------------------------------------------------------------ */
/* Bloklarga o'girish                                                  */
/* ------------------------------------------------------------------ */

/**
 * 1-bosqich bloklar.
 *
 * Blueprint'ning O'ZI blok bo'lmaydi — u o'qituvchiga ko'rsatiladigan
 * mazmun emas, keyingi bosqichlar uchun ko'rsatma. `inputParams.blueprint`
 * ga yoziladi (`commitStage` ning `paramsPatch` i), dars ishlanmadagi
 * `skeleton` bilan bir xil yo'l.
 */
export function testBlueprintBlocks(spec: StageSpec, out: TestBlueprintOut): Block[] {
  return [
    { id: blockId(spec.id, "heading", 0), type: "heading", level: 1, text: out.title },
    { id: blockId(spec.id, "objectives", 0), type: "objectives", items: out.objectives },
  ];
}

/**
 * Savollar + SHU BOSQICHNING javoblar kaliti.
 *
 * KALIT SERVERDA QURILADI, modeldan alohida so'ralmaydi: `answer` va
 * `explanation` savolning o'zida bor, ya'ni kalit bilan savolning
 * bir-biriga mos kelmasligi imkonsiz bo'lib qoladi. Modeldan kalitni
 * ikkinchi marta so'rash esa aynan o'sha nomuvofiqlikning manbai edi.
 *
 * `> 20` savolli testda ikki `answerKey` bloki chiqadi (`2a` va `2b`).
 * `lib/generation/quality.ts` ularni BIRLASHTIRIB qaraydi.
 */
export function testQuestionBlocks(spec: StageSpec, out: TestQuestionsOut): Block[] {
  const questions: Block[] = [];
  const items: { questionId: string; answer: string; explanation?: string }[] = [];

  out.questions.forEach((question, index) => {
    const id = blockId(spec.id, "question", index);
    const base = {
      id,
      type: "question" as const,
      kind: question.kind,
      text: question.text,
      answer: question.answer,
      points: question.points,
      bloom: question.bloom,
    };

    // `kind` bo'yicha ANIQ tarmoq: model `pairs` ni noto'g'ri turda
    // to'ldirgan bo'lsa ham blok to'g'ri chiqadi.
    questions.push(
      question.kind === "match"
        ? { ...base, options: [], pairs: question.pairs }
        : { ...base, options: question.options },
    );

    items.push({ questionId: id, answer: question.answer, explanation: question.explanation });
  });

  return [
    ...questions,
    { id: blockId(spec.id, "answerKey", 0), type: "answerKey", items },
  ];
}

export function testClosingBlocks(spec: StageSpec, out: TestClosingOut): Block[] {
  return [
    { id: blockId(spec.id, "rubric", 0), type: "rubric", criteria: out.rubric.criteria },
    ...out.notes.map((note, i) => ({
      id: blockId(spec.id, "note", i),
      type: "note" as const,
      tone: note.tone,
      text: note.text,
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Bosqich ko'rsatmalari (kesh chegarasidan KEYIN)                     */
/* ------------------------------------------------------------------ */

/** Blueprint'ni promptga tushadigan ro'yxat qilib yozadi. */
function blueprintLines(blueprint: TestBlueprintOut): string[] {
  return blueprint.items.map(
    (item) =>
      `- ${item.objective}: ${String(item.count)} ta savol, Bloom darajasi "${item.bloom}"`,
  );
}

export function testStageInstruction(
  spec: StageSpec,
  ctx: {
    questionCount: number;
    kinds: readonly QuestionKind[];
    blueprint: TestBlueprintOut | null;
  },
): string {
  if (spec.kind === "skeleton") {
    return [
      "Testning BLUEPRINT ini tuz.",
      "",
      "Kerak:",
      "- testning sarlavhasi;",
      "- 2-5 ta o'lchanadigan ta'lim maqsadi;",
      "- savollarning maqsadlar bo'yicha taqsimoti: har maqsaddan nechta",
      "  savol va qaysi Bloom darajasida.",
      "",
      `Taqsimotdagi savollar yig'indisi aynan ${String(ctx.questionCount)} bo'lsin.`,
      "Bloom darajalari aralash bo'lsin: hammasi \"remember\" bo'lgan test",
      "faqat yodlashni o'lchaydi.",
      "Savollarning O'ZINI hozir yozma — ular keyingi bosqichda so'raladi.",
    ].join("\n");
  }

  const blueprint = ctx.blueprint;
  if (blueprint === null) {
    throw new Error(`testStageInstruction: "${spec.id}" bosqichi uchun blueprint yo'q`);
  }

  if (spec.kind === "content") {
    const range = spec.range ?? { from: 0, to: ctx.questionCount };
    const wanted = range.to - range.from;

    return [
      `Testning ${String(range.from + 1)}-${String(range.to)} savollarini yoz.`,
      "",
      `Test: ${blueprint.title}`,
      "",
      "Testning umumiy taqsimoti (kontekst uchun):",
      ...blueprintLines(blueprint),
      "",
      `Endi AYNAN ${String(wanted)} ta savol yoz.`,
      `Ruxsat etilgan turlar: ${ctx.kinds.join(", ")}.`,
      "Taqsimotga amal qil: Bloom darajalari yuqoridagi ro'yxatga mos kelsin.",
      "Har savolga izoh (explanation) yoz — javoblar kaliti shundan quriladi.",
      "Oldingi yoki keyingi bosqichdagi savollarni takrorlama.",
    ].join("\n");
  }

  return [
    "Testni tekshirish uchun rubrika va izohlar yoz.",
    "",
    `Test: ${blueprint.title}`,
    "Ta'lim maqsadlari:",
    ...blueprint.objectives.map((objective) => `- ${objective}`),
    "",
    "Kerak:",
    "- baholash mezonlari: 2-5 ta. Qisqa javobli va moslashtirish",
    "  savollarini o'qituvchi qo'lda tekshiradi — mezonlar aynan shunga",
    "  yordam bersin;",
    "- izohlar: kamida bittasi testni o'tkazish tartibi haqida (vaqt,",
    "  tarqatish, ko'chirishning oldini olish).",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Arzon strukturaviy darvozalar                                       */
/* ------------------------------------------------------------------ */

/**
 * 1-bosqichdan KEYIN, 2-bosqichdan OLDIN ishlaydigan arzon qorovul.
 *
 * `plans.ts:checkSkeleton` bilan ayni maqsad va ayni yo'l: buzuq
 * blueprint'dan keyingi bosqichlar ham yaroqsiz chiqadi, ularni baribir
 * generatsiya qilib oxirida rad etish esa ikki qimmat chaqiruvning puli.
 * `{ok:false}` qaytgach `runStage` kreditni `release` qiladi va hujjatni
 * `FAILED` ga o'tkazadi.
 */
export function checkBlueprint(out: TestBlueprintOut, questionCount: number): SkeletonGate {
  const total = out.items.reduce((sum, item) => sum + item.count, 0);
  if (total !== questionCount) {
    return {
      ok: false,
      reason: `blueprint: savollar yig'indisi ${String(total)}, so'ralgani ${String(questionCount)}`,
    };
  }

  return { ok: true };
}

/**
 * Savollar bosqichidan keyingi darvoza — BLOK SXEMASIDAN OLDIN.
 *
 * Sxema buzilishini `commitStage` ham ushlaydi, lekin uning sababi Zod
 * dumpi bo'lib `failReason` ga tushardi. Bu yerda sabab o'qiladigan
 * bo'ladi, va tekshiruv `release` dan oldin bajariladi.
 */
export function checkTestQuestions(
  out: TestQuestionsOut,
  args: { expected: number; kinds: readonly QuestionKind[] },
): SkeletonGate {
  if (out.questions.length !== args.expected) {
    return {
      ok: false,
      reason: `savollar: ${String(out.questions.length)} ta qaytdi, ${String(args.expected)} ta kerak`,
    };
  }

  const allowed = new Set<string>(args.kinds);
  for (const question of out.questions) {
    if (!allowed.has(question.kind)) {
      return { ok: false, reason: `savollar: ruxsat etilmagan tur "${question.kind}"` };
    }
    // `match` da `pairs` majburiy (blok sxemasi kamida 2 ta juft talab
    // qiladi); boshqa turda to'g'ri javob bo'sh bo'lib qolmasin.
    if (question.kind === "match" && question.pairs.length < 2) {
      return { ok: false, reason: "savollar: moslashtirish savolida juftlik yetarli emas" };
    }
    if (question.kind === "mcq" && !question.options.includes(question.answer)) {
      return { ok: false, reason: "savollar: to'g'ri javob variantlar ichida yo'q" };
    }
  }

  return { ok: true };
}

/**
 * Blueprint'dagi Bloom taqsimoti — sifat bahosi shu bilan solishtiradi.
 *
 * Alohida funksiya, chunki `quality.ts` blueprint'ning TO'LIQ shaklini
 * bilishi shart emas: unga faqat "qaysi darajadan nechta kutiladi" kerak.
 */
export type BloomTargets = Partial<Record<BloomLevel, number>>;

export function bloomTargets(items: readonly { bloom: BloomLevel; count: number }[]): BloomTargets {
  const targets: BloomTargets = {};
  for (const item of items) {
    targets[item.bloom] = (targets[item.bloom] ?? 0) + item.count;
  }
  return targets;
}
