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
  type StageSpec,
} from "./plans";
import { FROZEN_GUIDE, teacherParams } from "./prompts";
import { buildTopicContext } from "./retrieval";
import { scoreDocument, SCORE_FAIL } from "./quality";

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
const ParamsSchema = z.object({
  durationMinutes: z.number().int().min(1),
  contextChunkIds: z.array(z.string()),
  progress: ProgressSchema,
  skeleton: Stage1Out.optional(),
});

/**
 * Qayta urinish mumkin bo'lgan xatolar.
 *
 * `unknown` ham shu ro'yxatda: tarmoq uzilishi va timeout `lib/llm/call.ts`
 * da `LlmError("unknown")` ga o'raladi, ular esa haqiqatan vaqtinchalik.
 * Cheksiz aylanishdan `MAX_ATTEMPTS` himoya qiladi — uchinchi urinishdan
 * keyin kredit baribir qaytariladi.
 */
function isRetryable(error: unknown): boolean {
  if (!isLlmError(error)) return false;
  return error.kind === "rate_limit" || error.kind === "overloaded" || error.kind === "unknown";
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
      topicId: true,
      inputParams: true,
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

  const params = ParamsSchema.parse(doc.inputParams);
  const plan = buildPlan(params.skeleton?.stages.length ?? null);
  const stageIndex = params.progress.stage;
  const spec = plan.stages[stageIndex];

  // Kursor rejadan chiqib ketgan: hamma bosqich yozilgan, lekin kredit
  // yechilmagan. Bu faqat oxirgi bosqich commit'idan keyin jarayon o'lganda
  // bo'ladi — yakunni shu yerda tugatamiz.
  if (!spec) return finishDocument({ documentId, userId, params, topic: doc.topic });

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

  // KESH TARTIBI: muzlatilgan qism -> kontekst -> o'qituvchi parametrlari.
  // Bosqichga xos ko'rsatma `messages` da, `system` da EMAS — aks holda har
  // bosqich prefiksni buzib, keshni butunlay yo'q qilardi.
  const system: SystemPart[] = [
    { text: FROZEN_GUIDE, cacheable: true },
    { text: context, cacheable: true },
    {
      text: teacherParams({
        grade: doc.topic.grade,
        durationMinutes: params.durationMinutes,
        subjectName: doc.topic.subject.nameUz,
      }),
    },
  ];

  const instruction = stageInstruction(spec, {
    durationMinutes: params.durationMinutes,
    skeleton: params.skeleton ?? null,
  });

  try {
    const produced = await produceBlocks({
      spec,
      system,
      instruction,
      documentId,
      userId,
      durationMinutes: params.durationMinutes,
      skeleton: params.skeleton ?? null,
    });

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

    return finishDocument({
      documentId,
      userId,
      params: { ...params, skeleton: params.skeleton },
      topic: doc.topic,
    });
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

/** Bitta `runLlm` va uning natijasini bloklarga o'girish. */
async function produceBlocks(args: {
  spec: StageSpec;
  system: SystemPart[];
  instruction: string;
  documentId: string;
  userId: string;
  durationMinutes: number;
  skeleton: Stage1Out | null;
}): Promise<Produced> {
  const { spec, system, instruction, documentId, userId } = args;

  const base = {
    purpose: stagePurpose(spec),
    tier: "mid" as const,
    userId,
    // A/B taqsimoti shundan hashlanadi — bitta hujjatning HAMMA bosqichi
    // bir xil provayderga tushadi, aks holda kesh va muzlatilgan
    // kontekstning foydasi yo'qoladi.
    documentId,
    system,
    messages: [{ role: "user" as const, content: instruction }],
  };

  if (spec.kind === "skeleton") {
    const result = await runLlm({ ...base, schema: Stage1Out });
    const gate = checkSkeleton(result.data, args.durationMinutes);
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
    const skeleton = args.skeleton;
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
 * Oxirgi bosqichdan keyingi yakun: sifat bahosi -> `charge` yoki `release`.
 *
 * `charge` HUJJATNI O'ZI `DONE` qiladi va `CreditTx` yozadi — bitta
 * tranzaksiyada (`lib/credits/ledger.ts`). Statusni bu yerda qo'lda
 * o'zgartirish `DocumentNotRunning` ga olib kelardi.
 */
async function finishDocument(args: {
  documentId: string;
  userId: string;
  params: z.infer<typeof ParamsSchema>;
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
    durationMinutes: args.params.durationMinutes,
    curriculumTerms: [...args.topic.objectives, ...args.topic.keywords],
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
