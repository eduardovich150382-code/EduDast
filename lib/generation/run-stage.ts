import { z } from "zod";
import { charge, release } from "@/lib/credits/ledger";
import { DocumentContent, type Block } from "@/lib/documents/blocks";
import { claimStage, commitStage, MAX_ATTEMPTS } from "@/lib/documents/lifecycle";
import { prisma } from "@/lib/db";
import { isLlmError, runLlm, type SystemPart } from "@/lib/llm";
import {
  buildPlan,
  checkSkeleton,
  stage1Blocks,
  stage2Blocks,
  stage3Blocks,
  stageInstruction,
  stagePurpose,
  Stage1Out,
  Stage2Out,
  Stage3Out,
  type GenerationFeature,
  type StageSpec,
} from "./plans";
import {
  bloomTargets,
  buildTestPlan,
  checkBlueprint,
  checkTestQuestions,
  testBlueprintBlocks,
  testClosingBlocks,
  testQuestionBlocks,
  testStageInstruction,
  TestBlueprintOut,
  TestClosingOut,
  TestQuestionsOut,
} from "./plans-test";
import {
  DIFFICULTIES,
  LESSON_GUIDE,
  lessonTail,
  QUESTION_KINDS,
  SHARED_GUIDE,
  teacherParams,
  TEST_GUIDE,
  testTail,
} from "./prompts";
import { buildTopicContext } from "./retrieval";
import { scoreDocument, SCORE_FAIL, type ScoreSpec } from "./quality";

/**
 * AYNAN BITTA bosqichni bajaradi.
 *
 * Route'dan ajratilgan sabab: konveyerning butun mantig'i (egallash, xato
 * tasnifi, kredit yechish) HTTP qatlamisiz sinaladi —
 * `tests/generation-stage-route.test.ts` shu funksiyani parallel chaqirib
 * poygani tekshiradi.
 *
 * BITTA CHAQIRUVDA BITTA `runLlm`. Ikkitasi bo'lsa Vercel Hobby'ning 60
 * soniyalik shifti buzilardi va yarim bajarilgan ish yo'qolardi.
 */

/** `runStage` natijasi — HTTP statusiga route'da o'giriladi. */
export type StageOutcome =
  /** Bosqich yozildi, davom etish kerak. */
  | { kind: "advanced"; stage: number; total: number }
  /** Oxirgi bosqich o'tdi, kredit yechildi. */
  | { kind: "done"; score: number }
  /** Boshqa ishchi shu bosqichni egallagan (409). */
  | { kind: "busy" }
  /** Vaqtinchalik xato — keyinroq qayta urinish mumkin (503). */
  | { kind: "retry"; reason: string }
  /** Hujjat yaroqsiz, kredit qaytarildi. */
  | { kind: "failed"; reason: string }
  /** Hujjat allaqachon tugagan yoki topilmadi. */
  | { kind: "complete" }
  | { kind: "notFound" };

const ProgressSchema = z.object({
  stage: z.number().int().min(0),
  total: z.number().int().min(1),
  attempts: z.number().int().min(0),
});

/**
 * `Document.inputParams` ning shakli.
 *
 * `.parse` (safeParse emas): bu maydonni FAQAT bizning kodimiz yozadi
 * (`server/generation-actions.ts` va `commitStage`). Mos kelmasa — bu
 * dastur xatosi, uni jimgina yutish keyingi sessiyada qidiriladigan
 * "sababsiz FAILED" ga aylanardi.
 */
const BaseParams = z.object({
  contextChunkIds: z.array(z.string()),
  progress: ProgressSchema,
});

const LessonParams = BaseParams.extend({
  durationMinutes: z.number().int().min(1),
  skeleton: Stage1Out.optional(),
});

const TestParams = BaseParams.extend({
  questionCount: z.number().int().min(1),
  kinds: z.array(z.enum(QUESTION_KINDS)).min(1),
  difficulty: z.enum(DIFFICULTIES),
  blueprint: TestBlueprintOut.optional(),
});

/**
 * Bitta generatsiya ishi — tur va uning parametrlari BIRGA.
 *
 * `inputParams` ning o'zida `type` yo'q (u `Document.type` da), shuning
 * uchun sxema turga qarab TANLANADI va natija shu union'ga o'raladi. Bir
 * sxemaga ikki turning maydonlarini ixtiyoriy qilib tiqish `.parse` ning
 * butun foydasini — "mos kelmasa bu dastur xatosi" kafolatini — yo'qotardi.
 */
type Job =
  | { type: "LESSON_PLAN"; params: z.infer<typeof LessonParams> }
  | { type: "TEST"; params: z.infer<typeof TestParams> };

function readJob(type: string, inputParams: unknown): Job | null {
  if (type === "LESSON_PLAN") {
    return { type: "LESSON_PLAN", params: LessonParams.parse(inputParams) };
  }
  if (type === "TEST") {
    return { type: "TEST", params: TestParams.parse(inputParams) };
  }
  return null;
}

const FEATURE: Record<Job["type"], GenerationFeature> = {
  LESSON_PLAN: "lesson-plan",
  TEST: "test",
};

/** Turga xos qo'llanma va parametr quyrug'i — kesh tartibini saqlaydi. */
function systemParts(job: Job, context: string, topic: { grade: number; subjectName: string }) {
  const guide = job.type === "TEST" ? TEST_GUIDE : LESSON_GUIDE;
  const tail =
    job.type === "TEST"
      ? testTail({
          questionCount: job.params.questionCount,
          kinds: job.params.kinds,
          difficulty: job.params.difficulty,
        })
      : lessonTail(job.params.durationMinutes);

  // KESH TARTIBI: umumiy qo'llanma -> kontekst -> turga xos qo'llanma ->
  // o'qituvchi parametrlari. Birinchi IKKITASI ikkala tur uchun aynan bir
  // xil, shuning uchun bir mavzudan dars ishlanma yaratgan o'qituvchi test
  // yaratganda prefiks keshdan o'qiladi.
  //
  // `SHARED_GUIDE` ga `cacheable` QO'YILMAYDI: u yolg'iz o'zi Anthropic'ning
  // minimal token chegarasidan qisqa chiqishi mumkin, chegara esa kontekstdan
  // keyin baribir bor va u shu matnni ham qamrab oladi.
  return [
    { text: SHARED_GUIDE },
    { text: context, cacheable: true },
    { text: guide, cacheable: true },
    { text: `${teacherParams(topic)}\n${tail}` },
  ] satisfies SystemPart[];
}

/** Bosqichga xos ko'rsatma — `messages` ga boradi, `system` ga EMAS. */
function instructionFor(job: Job, spec: StageSpec): string {
  if (job.type === "TEST") {
    return testStageInstruction(spec, {
      questionCount: job.params.questionCount,
      kinds: job.params.kinds,
      blueprint: job.params.blueprint ?? null,
    });
  }
  return stageInstruction(spec, {
    durationMinutes: job.params.durationMinutes,
    skeleton: job.params.skeleton ?? null,
  });
}

/** Yakuniy baho parametrlari. */
function scoreSpecFor(job: Job): ScoreSpec {
  if (job.type === "TEST") {
    return {
      type: "TEST",
      questionCount: job.params.questionCount,
      bloomTargets: bloomTargets(job.params.blueprint?.items ?? []),
    };
  }
  return { type: "LESSON_PLAN", durationMinutes: job.params.durationMinutes };
}

/**
 * Qayta urinish mumkin bo'lgan xatolar.
 *
 * Ro'yxat BU YERDA TAKRORLANMAYDI — u `lib/llm/errors.ts:RETRYABLE_KINDS` da,
 * bitta joyda. Ilgari bu funksiya o'z nusxasini tutardi va u konstruktordagi
 * `retryable` bayrog'i bilan `unknown` bo'yicha qarama-qarshi edi.
 */
function isRetryable(error: unknown): boolean {
  return isLlmError(error) && error.retryable;
}

function errorReason(error: unknown): string {
  if (isLlmError(error)) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : "noma'lum xato";
}

export async function runStage(args: {
  documentId: string;
  userId: string;
}): Promise<StageOutcome> {
  const { documentId, userId } = args;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: {
      status: true,
      type: true,
      topicId: true,
      inputParams: true,
      creditsHeldFor: true,
      topic: {
        select: {
          grade: true,
          objectives: true,
          keywords: true,
          subject: { select: { nameUz: true } },
        },
      },
    },
  });

  if (!doc) return { kind: "notFound" };
  if (doc.status === "DONE") return { kind: "complete" };
  if (doc.status === "FAILED") return { kind: "failed", reason: "hujjat allaqachon bekor qilingan" };

  // Qo'llab-quvvatlanmagan tur (`GUIDE`/`SLIDES`/`CROSSWORD` — hozircha
  // hech kim yaratmaydi). JIM O'TIB KETMAYMIZ: dars ishlanma sifatida
  // ishlashga urinish o'qituvchiga mutlaqo boshqa hujjatni berardi.
  const job = readJob(doc.type, doc.inputParams);
  if (!job) {
    const reason = `qo'llab-quvvatlanmagan hujjat turi: ${doc.type}`;
    await release(userId, doc.creditsHeldFor, documentId, reason);
    return { kind: "failed", reason };
  }

  const { params } = job;
  const plan =
    job.type === "TEST"
      ? buildTestPlan(job.params.questionCount)
      : buildPlan(job.params.skeleton?.stages.length ?? null);
  const stageIndex = params.progress.stage;
  const spec = plan.stages[stageIndex];

  // Kursor rejadan chiqib ketgan: hamma bosqich yozilgan, lekin kredit
  // yechilmagan. Bu faqat oxirgi bosqich commit'idan keyin jarayon o'lganda
  // bo'ladi — yakunni shu yerda tugatamiz.
  if (!spec) return finishDocument({ documentId, userId, job, topic: doc.topic });

  // Bosqichni EGALLASH — poyga darvozasi. Qulfsiz o'qish (yuqorida) eskirgan
  // bo'lsa shu yerda `null` qaytadi va hech narsa buzilmaydi.
  const claimed = await claimStage(prisma, { documentId, userId, stage: stageIndex });
  if (!claimed) return { kind: "busy" };

  // URINISH SHIFTI — `runLlm` DAN OLDIN. Tekshiruv keyin bo'lsa, to'rtinchi
  // urinishning puli ham sarflanardi.
  if (claimed.attempts > MAX_ATTEMPTS) {
    const reason = `stage_${spec.id}_failed_${String(MAX_ATTEMPTS)}x`;
    await release(userId, claimed.creditsHeldFor, documentId, reason);
    return { kind: "failed", reason };
  }

  const context = await buildTopicContext(doc.topicId, params.contextChunkIds);

  const system = systemParts(job, context, {
    grade: doc.topic.grade,
    subjectName: doc.topic.subject.nameUz,
  });

  const instruction = instructionFor(job, spec);

  try {
    const produced = await produceBlocks({ spec, system, instruction, documentId, userId, job });

    if (!produced.ok) {
      await release(userId, claimed.creditsHeldFor, documentId, produced.reason);
      return { kind: "failed", reason: produced.reason };
    }

    const written = await commitStage(prisma, {
      documentId,
      userId,
      stage: stageIndex,
      blocks: produced.blocks,
      progressPatch: produced.total === undefined ? undefined : { total: produced.total },
      paramsPatch: produced.paramsPatch,
    });

    // Kursor allaqachon surilgan: boshqa ishchi bu bosqichni bajarib
    // bo'lgan. Natijani TASHLAYMIZ — duplikat blok yozishdan ko'ra bir
    // chaqiruvning pulini yo'qotgan yaxshi.
    if (!written) {
      console.warn(`commitStage yutqazdi: ${documentId} bosqich ${String(stageIndex)}`);
      return { kind: "busy" };
    }

    const total = produced.total ?? params.progress.total;
    const nextIndex = stageIndex + 1;
    if (nextIndex < total) {
      return { kind: "advanced", stage: nextIndex, total };
    }

    return finishDocument({ documentId, userId, job, topic: doc.topic });
  } catch (error) {
    if (isRetryable(error)) {
      // `release` YO'Q: ijara 90 soniyada bo'shaydi va AYNI bosqich qayta
      // egallanadi. "Brauzerni yopib qayta ochsang davom etadi" shu yo'l.
      return { kind: "retry", reason: errorReason(error) };
    }
    const reason = errorReason(error);
    await release(userId, claimed.creditsHeldFor, documentId, reason);
    return { kind: "failed", reason };
  }
}

type Produced =
  | {
      ok: true;
      blocks: Block[];
      total?: number;
      paramsPatch?: Record<string, unknown>;
    }
  | { ok: false; reason: string };

/** `runLlm` ning bosqichdan bosqichga o'zgarmaydigan qismi. */
type LlmBase = {
  purpose: string;
  tier: "mid";
  userId: string;
  documentId: string;
  system: SystemPart[];
  messages: { role: "user"; content: string }[];
};

/**
 * Bitta `runLlm` va uning natijasini bloklarga o'girish.
 *
 * TUR BO'YICHA TARMOQLANADI, lekin "bitta chaqiruvda bitta `runLlm`"
 * qoidasi ikkala tarmoqda ham saqlanadi.
 */
async function produceBlocks(args: {
  spec: StageSpec;
  system: SystemPart[];
  instruction: string;
  documentId: string;
  userId: string;
  job: Job;
}): Promise<Produced> {
  const { spec, system, instruction, documentId, userId, job } = args;

  const base: LlmBase = {
    purpose: stagePurpose(spec, FEATURE[job.type]),
    tier: "mid",
    userId,
    // A/B taqsimoti shundan hashlanadi — bitta hujjatning HAMMA bosqichi
    // bir xil provayderga tushadi, aks holda kesh va muzlatilgan
    // kontekstning foydasi yo'qoladi.
    documentId,
    system,
    messages: [{ role: "user", content: instruction }],
  };

  return job.type === "TEST"
    ? produceTestBlocks(spec, base, job.params)
    : produceLessonBlocks(spec, base, job.params);
}

async function produceLessonBlocks(
  spec: StageSpec,
  base: LlmBase,
  params: z.infer<typeof LessonParams>,
): Promise<Produced> {
  if (spec.kind === "skeleton") {
    const result = await runLlm({ ...base, schema: Stage1Out });
    const gate = checkSkeleton(result.data, params.durationMinutes);
    if (!gate.ok) return { ok: false, reason: gate.reason };

    return {
      ok: true,
      blocks: stage1Blocks(spec, result.data),
      // Reja endi aniq: bosqichlar ko'p bo'lsa mazmun ikkiga bo'linadi.
      total: buildPlan(result.data.stages.length).stages.length,
      // Skelet `contentJson` ga sig'maydi (`stages` bloki harakatlarsiz
      // haqiqiy emas), shuning uchun `inputParams` ga yoziladi.
      paramsPatch: { skeleton: result.data },
    };
  }

  if (spec.kind === "content") {
    const skeleton = params.skeleton;
    if (!skeleton) return { ok: false, reason: "mazmun bosqichi uchun skelet yo'q" };

    const range = spec.range ?? { from: 0, to: skeleton.stages.length };
    const expected = skeleton.stages.slice(range.from, range.to);

    const result = await runLlm({ ...base, schema: Stage2Out });
    if (result.data.stages.length < expected.length) {
      return {
        ok: false,
        reason: `bosqich ${spec.id}: ${String(result.data.stages.length)} ta bosqich qaytdi, ${String(expected.length)} ta kerak`,
      };
    }

    // NOM va DAQIQA skeletdan olinadi, model javobidan EMAS. Skelet
    // darvozadan o'tgan, ya'ni daqiqa yig'indisi to'g'ri; model ularni
    // "yaxshilab" o'zgartirsa yig'indi buzilib, sifat bahosi yiqilardi.
    const merged = expected.map((stage, i) => ({
      title: stage.title,
      minutes: stage.minutes,
      teacherActions: result.data.stages[i]!.teacherActions,
      studentActions: result.data.stages[i]!.studentActions,
    }));

    return { ok: true, blocks: stage2Blocks(spec, { stages: merged }) };
  }

  const result = await runLlm({ ...base, schema: Stage3Out });
  return { ok: true, blocks: stage3Blocks(spec, result.data) };
}

/**
 * Test bosqichlari.
 *
 * Dars ishlanmadan farqi: `total` bu yerda QAYTARILMAYDI — savol soni
 * boshidan ma'lum, ya'ni reja hujjat yaratilgan paytda to'liq hisoblangan
 * (`server/generation-actions.ts`).
 */
async function produceTestBlocks(
  spec: StageSpec,
  base: LlmBase,
  params: z.infer<typeof TestParams>,
): Promise<Produced> {
  if (spec.kind === "skeleton") {
    const result = await runLlm({ ...base, schema: TestBlueprintOut });
    const gate = checkBlueprint(result.data, params.questionCount);
    if (!gate.ok) return { ok: false, reason: gate.reason };

    return {
      ok: true,
      blocks: testBlueprintBlocks(spec, result.data),
      // Blueprint o'qituvchiga ko'rsatiladigan mazmun emas, keyingi
      // bosqichlar uchun ko'rsatma — `skeleton` bilan bir xil yo'l.
      paramsPatch: { blueprint: result.data },
    };
  }

  if (spec.kind === "content") {
    const blueprint = params.blueprint;
    if (!blueprint) return { ok: false, reason: "savollar bosqichi uchun blueprint yo'q" };

    const range = spec.range ?? { from: 0, to: params.questionCount };

    const result = await runLlm({ ...base, schema: TestQuestionsOut });
    const gate = checkTestQuestions(result.data, {
      expected: range.to - range.from,
      kinds: params.kinds,
    });
    if (!gate.ok) return { ok: false, reason: `bosqich ${spec.id}: ${gate.reason}` };

    return { ok: true, blocks: testQuestionBlocks(spec, result.data) };
  }

  const result = await runLlm({ ...base, schema: TestClosingOut });
  return { ok: true, blocks: testClosingBlocks(spec, result.data) };
}

/**
 * Oxirgi bosqichdan keyingi yakun: sifat bahosi -> `charge` yoki `release`.
 *
 * `charge` HUJJATNI O'ZI `DONE` qiladi va `CreditTx` yozadi — bitta
 * tranzaksiyada (`lib/credits/ledger.ts`). Statusni bu yerda qo'lda
 * o'zgartirish `DocumentNotRunning` ga olib kelardi.
 */
async function finishDocument(args: {
  documentId: string;
  userId: string;
  job: Job;
  topic: { objectives: string[]; keywords: string[] };
}): Promise<StageOutcome> {
  const { documentId, userId } = args;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: { contentJson: true, creditsHeldFor: true },
  });
  if (!doc) return { kind: "notFound" };

  const content = DocumentContent.parse(doc.contentJson);
  const report = scoreDocument({
    content,
    spec: scoreSpecFor(args.job),
    curriculumTerms: [...args.topic.objectives, ...args.topic.keywords],
    // Parcha topilmagan mavzuda qamrov o'lchami hujjatni emas, bazamizdagi
    // bo'shliqni o'lchaydi — shuning uchun u vazndan chiqariladi.
    hasContext: args.job.params.contextChunkIds.length > 0,
  });

  if (report.score < SCORE_FAIL) {
    const reason = `sifat: ${report.score.toFixed(2)}`;
    await release(userId, doc.creditsHeldFor, documentId, reason);
    return { kind: "failed", reason };
  }

  // Bahoni AVVAL yozamiz: `charge` yiqilsa ham (masalan `HoldMismatch`)
  // tahlil uchun ball qoladi. `charge` statusni `DONE` qilgani uchun bu
  // yozuv `RUNNING` holatda bajarilishi shart.
  await prisma.document.updateMany({
    where: { id: documentId, userId, status: "RUNNING" },
    data: { qualityScore: report.score, qualityNotes: report as unknown as object },
  });

  await charge(userId, doc.creditsHeldFor, documentId);
  return { kind: "done", score: report.score };
}
