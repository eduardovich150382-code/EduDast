import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentContent, type Block } from "@/lib/documents/blocks";

/**
 * 2a/2b BO'LINISH YO'LI — uchidan-uchiga.
 *
 * NEGA ALOHIDA FAYL: bu yo'l 08-sessiyagacha bir marta ham ishlamagan.
 * Ikkala jonli yugurishda ham model aynan 5 bosqich qaytardi, chegara esa
 * `> 5` — ya'ni `buildPlan` ning ikkinchi shoxi, `progress.total` ning 3 dan
 * 4 ga o'zgarishi va kursorning to'rt qadami HECH QACHON bajarilmagan.
 * Modelning kayfiyatiga tayanib turgan yo'lni test bilan qotiramiz.
 *
 * NEGA SOXTA PROVAYDER, `runLlm` MOCK'I EMAS (`generation-stage-route.test.ts`
 * dan farqi): u yerda savol "qaysi vaziyatda pul sarflanadi", bu yerda esa
 * "konveyer to'rt bosqichni oxirigacha olib boradimi". Shuning uchun `runLlm`
 * HAQIQIY: sxema tekshiruvi, marshrutlash va jurnal yozuvi ham yo'lga kiradi.
 *
 * NEGA XOTIRADAGI BAZA: `claimStage`/`commitStage` ning SQL semantikasi
 * (qator qulfi, `jsonb ||` append, eskirgan kursorda `false`) allaqachon
 * `tests/integration/generation-lifecycle.test.ts` da HAQIQIY Postgres'da
 * qoplangan. Bu yerda tekshirilayotgani — ORKESTRATSIYA: `runStage` kursorni
 * to'g'ri suradimi, `total` ni yangilaydimi, har bosqichni AYNAN BIR MARTA
 * commit qiladimi va oxirida bitta `charge` bo'ladimi.
 */

const SKELETON_STAGE_COUNT = 8;
const DURATION = 90;

type Progress = { stage: number; total: number; attempts: number };
type Params = {
  durationMinutes: number;
  contextChunkIds: string[];
  progress: Progress;
  skeleton?: unknown;
};
type Row = {
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  type: "LESSON_PLAN" | "TEST";
  topicId: string;
  inputParams: Params;
  contentJson: { v: number; blocks: Block[] };
  creditsHeldFor: number;
  qualityScore?: number;
  topic: {
    grade: number;
    objectives: string[];
    keywords: string[];
    subject: { nameUz: string };
  };
};

/** Jarayon davomidagi yagona hujjat — testlar orasida qayta tiklanadi. */
let row: Row;

/** Kim qaysi bosqichni egallagani / commit qilgani — takrorni ushlash uchun. */
let claimed: number[];
let committed: number[];

const mocks = vi.hoisted(() => ({
  charge: vi.fn(),
  release: vi.fn(),
  buildTopicContext: vi.fn(),
  writeLlmCall: vi.fn(),
  checkBudget: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    document: {
      // `run-stage.ts` ikki xil `select` bilan chaqiradi; to'liq qatorni
      // qaytarish ikkalasini ham qoniqtiradi.
      findFirst: vi.fn(async () => row),
      updateMany: vi.fn(async ({ data }: { data: { qualityScore: number } }) => {
        row.qualityScore = data.qualityScore;
        return { count: 1 };
      }),
    },
  },
}));

vi.mock("@/lib/credits/ledger", () => ({
  charge: mocks.charge,
  release: mocks.release,
}));
vi.mock("@/lib/generation/retrieval", () => ({ buildTopicContext: mocks.buildTopicContext }));
vi.mock("@/lib/llm/log", () => ({ writeLlmCall: mocks.writeLlmCall }));
vi.mock("@/lib/budget/guard", () => ({ checkBudget: mocks.checkBudget }));

vi.mock("@/lib/documents/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/documents/lifecycle")>();
  return {
    ...actual,
    claimStage: vi.fn(async (_db: unknown, args: { stage: number }) => {
      if (row.status === "DONE" || row.status === "FAILED") return null;
      const progress = row.inputParams.progress;
      // Haqiqiy darvoza bilan bir xil shart: kursor mos VA ijara bo'sh.
      if (progress.stage !== args.stage) return null;
      if (progress.attempts !== 0) return null;

      progress.attempts += 1;
      row.status = "RUNNING";
      claimed.push(args.stage);
      return {
        topicId: row.topicId,
        creditsHeldFor: row.creditsHeldFor,
        inputParams: row.inputParams,
        attempts: progress.attempts,
      };
    }),
    commitStage: vi.fn(
      async (
        _db: unknown,
        args: {
          stage: number;
          blocks: Block[];
          progressPatch?: Record<string, number>;
          paramsPatch?: Record<string, unknown>;
        },
      ) => {
        const progress = row.inputParams.progress;
        if (row.status !== "RUNNING" || progress.stage !== args.stage) return false;

        // Haqiqiy `commitStage` ham yozishdan oldin tekshiradi.
        DocumentContent.parse({ v: 1, blocks: args.blocks });
        row.contentJson.blocks.push(...args.blocks);
        Object.assign(row.inputParams, args.paramsPatch ?? {});
        // Tartib haqiqiysidek: patch avval, keyin MAJBURIY stage/attempts.
        Object.assign(progress, args.progressPatch ?? {}, {
          stage: args.stage + 1,
          attempts: 0,
        });
        committed.push(args.stage);
        return true;
      },
    ),
  };
});

import { FakeProvider } from "@/lib/llm/providers/fake";
import { setProvider } from "@/lib/llm/providers/registry";

const ARGS = { documentId: "d-split", userId: "u-1" };

/** 8 bosqichli skelet — `SPLIT_THRESHOLD` (5) dan oshadi. */
const skeleton = {
  title: "Tezlanish va uning birliklari",
  objectives: [
    "Tezlanish tushunchasini o'z so'zlari bilan ta'riflaydi",
    "Tezlanishni formula bo'yicha hisoblaydi",
  ],
  materials: ["Doska va bo'r", "Fizika darsligi"],
  // 8 x 11 = 88, so'ralgani 90 -> `checkSkeleton` ning +-20 % darvozasidan
  // ham, `quality.ts` ning +-10 % chegarasidan ham o'tadi.
  stages: Array.from({ length: SKELETON_STAGE_COUNT }, (_, i) => ({
    title: `${String(i + 1)}-bosqich: tezlanish ustida ish`,
    minutes: 11,
  })),
};

/** Mazmun bosqichi javobi — `from` dan `to` gacha. */
function contentOut(from: number, to: number) {
  return {
    stages: skeleton.stages.slice(from, to).map((stage) => ({
      title: stage.title,
      minutes: stage.minutes,
      teacherActions: ["Tezlanish formulasini doskada chiqaradi va misol yechadi"],
      studentActions: ["Formulani daftarga yozib mustaqil misol yechadi"],
    })),
  };
}

const closingOut = {
  homework: {
    items: ["Darslikdagi 12-mashqni yeching va tezlanishni toping"],
    estimatedMinutes: 25,
  },
  rubric: {
    criteria: [
      { name: "Faollik", maxPoints: 5, descriptors: ["Savolga javob berdi"] },
      { name: "Aniqlik", maxPoints: 5, descriptors: ["Formulani xatosiz qo'lladi"] },
    ],
  },
  notes: [{ tone: "tip" as const, text: "Kuchsizroq o'quvchiga formulani yozib bering." }],
};

let fake: FakeProvider;

beforeEach(() => {
  vi.clearAllMocks();

  row = {
    status: "QUEUED",
    type: "LESSON_PLAN",
    topicId: "t-1",
    inputParams: {
      durationMinutes: DURATION,
      contextChunkIds: ["c-1"],
      // Hujjat yaratilganda qo'yiladigan boshlang'ich taxmin
      // (`server/generation-actions.ts`): 1-bosqich uni aniqlaydi.
      progress: { stage: 0, total: 3, attempts: 0 },
    },
    contentJson: { v: 1, blocks: [] },
    creditsHeldFor: 5,
    topic: {
      grade: 7,
      objectives: ["Tezlanishni hisoblaydi"],
      keywords: ["tezlanish", "formula"],
      subject: { nameUz: "Fizika" },
    },
  };
  claimed = [];
  committed = [];

  mocks.buildTopicContext.mockResolvedValue("## Kurikulum konteksti");
  mocks.writeLlmCall.mockResolvedValue("llmcall-1");
  mocks.checkBudget.mockResolvedValue({ kind: "full" });
  mocks.charge.mockImplementation(async () => {
    row.status = "DONE";
    return 95;
  });
  mocks.release.mockImplementation(async () => {
    row.status = "FAILED";
  });

  fake = new FakeProvider();
  // Zanjirning har bo'g'ini soxta provayderga tushsin — qaysi provayder
  // tanlanishi bu testning mavzusi emas.
  setProvider("anthropic", fake);
  setProvider("gemini", fake);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_API_KEY", "test-key");
  vi.stubEnv("LLM_AB_ENABLED", "false");

  // To'rt bosqichning javoblari — TARTIB BILAN.
  fake.queue(
    { kind: "ok", rawJson: JSON.stringify(skeleton) },
    { kind: "ok", rawJson: JSON.stringify(contentOut(0, 4)) },
    { kind: "ok", rawJson: JSON.stringify(contentOut(4, 8)) },
    { kind: "ok", rawJson: JSON.stringify(closingOut) },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Konveyerni oxirigacha haydaydi — klient (`stage-runner.tsx`) kabi. */
async function drive(maxSteps = 8) {
  const { runStage } = await import("@/lib/generation/run-stage");
  const outcomes = [];
  for (let i = 0; i < maxSteps; i++) {
    const outcome = await runStage(ARGS);
    outcomes.push(outcome);
    if (outcome.kind !== "advanced") break;
  }
  return outcomes;
}

describe("og'ir skelet 2a/2b ga bo'linadi", () => {
  it("reja to'rt bosqichga o'sadi va konveyer oxirigacha boradi", async () => {
    const outcomes = await drive();

    expect(outcomes.map((o) => o.kind)).toEqual(["advanced", "advanced", "advanced", "done"]);
    // `total` 1-bosqichdan KEYIN 3 dan 4 ga o'zgaradi.
    expect(outcomes[0]).toEqual({ kind: "advanced", stage: 1, total: 4 });
    expect(row.inputParams.progress.total).toBe(4);
  });

  it("kursor 0 -> 4 gacha bir qadamdan suriladi", async () => {
    await drive();
    expect(claimed).toEqual([0, 1, 2, 3]);
    expect(committed).toEqual([0, 1, 2, 3]);
    expect(row.inputParams.progress.stage).toBe(4);
    expect(row.inputParams.progress.attempts).toBe(0);
  });

  it("bosqichlar 2a va 2b sifatida jurnalga tushadi", async () => {
    await drive();

    // `purpose` marja tahlilining kaliti: 2a va 2b alohida ko'rinishi kerak,
    // aks holda bo'lingan hujjatning narxi bitta qatorga yopishib qolardi.
    const purposes = mocks.writeLlmCall.mock.calls.map(([rec]) => rec.purpose);
    expect(purposes).toEqual([
      "lesson-plan:stage-1",
      "lesson-plan:stage-2a",
      "lesson-plan:stage-2b",
      "lesson-plan:stage-3",
    ]);
  });

  it("har bosqich uchun AYNAN BITTA LLM chaqiruvi", async () => {
    await drive();
    // Vercel Hobby'ning 60 soniyalik shifti: bitta so'rovga bittadan ko'pi
    // sig'maydi.
    expect(fake.calls).toHaveLength(4);
  });

  it("2a va 2b skeletning turli yarmini so'raydi", async () => {
    await drive();

    /**
     * Ko'rsatmaning SO'RALGAN qismi.
     *
     * Butun matnda skeletning hamma bosqichi baribir bor — u kontekst uchun
     * ataylab beriladi ("Darsning umumiy rejasi"). Bo'linish esa undan
     * keyingi "Endi FAQAT ..." ro'yxatida ko'rinadi.
     */
    function wanted(content: string): string {
      return content.split("Endi FAQAT")[1]!.split("Nom va daqiqani")[0]!;
    }

    const ask2a = wanted(fake.calls[1]!.messages[0]!.content);
    const ask2b = wanted(fake.calls[2]!.messages[0]!.content);

    // half = ceil(8/2) = 4 -> 2a: [0,4), 2b: [4,8). Raqamlash uzluksiz:
    // 2b "5." dan boshlanadi, "1." dan emas.
    expect(ask2a).toContain("1. 1-bosqich");
    expect(ask2a).toContain("4. 4-bosqich");
    expect(ask2a).not.toContain("5-bosqich");

    expect(ask2b).toContain("5. 5-bosqich");
    expect(ask2b).toContain("8. 8-bosqich");
    expect(ask2b).not.toContain("1-bosqich");
  });
});

describe("bloklar takrorlanmaydi", () => {
  it("har bosqich bloklarini bir martadan qo'shadi", async () => {
    await drive();

    const ids = row.contentJson.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 1-bosqich: heading + objectives + materials; 2a va 2b: bittadan
    // `stages`; 3-bosqich: homework + rubric + note.
    expect(row.contentJson.blocks.map((b) => b.type)).toEqual([
      "heading",
      "objectives",
      "materials",
      "stages",
      "stages",
      "homework",
      "rubric",
      "note",
    ]);
  });

  it("skeletning 8 bosqichi to'liq va bir martadan yoziladi", async () => {
    await drive();

    const stages = row.contentJson.blocks
      .filter((b): b is Extract<Block, { type: "stages" }> => b.type === "stages")
      .flatMap((b) => b.items);

    expect(stages).toHaveLength(SKELETON_STAGE_COUNT);
    expect(stages.map((s) => s.title)).toEqual(skeleton.stages.map((s) => s.title));
    // Daqiqa yig'indisi skeletnikiga teng — sifat bahosi buzilmaydi.
    expect(stages.reduce((sum, s) => sum + s.minutes, 0)).toBe(88);
  });

  it("kursor surilgandan keyin AYNI bosqich qayta commit qilinmaydi", async () => {
    await drive();
    // Har indeks ro'yxatda faqat bir marta.
    expect(committed).toEqual([...new Set(committed)]);
  });
});

describe("kredit", () => {
  it("oxirida AYNAN BITTA charge, release yo'q", async () => {
    await drive();

    expect(mocks.charge).toHaveBeenCalledTimes(1);
    expect(mocks.charge).toHaveBeenCalledWith("u-1", 5, "d-split");
    expect(mocks.release).not.toHaveBeenCalled();
    expect(row.status).toBe("DONE");
  });

  it("oraliq bosqichlarda kredit yechilmaydi", async () => {
    const { runStage } = await import("@/lib/generation/run-stage");
    await runStage(ARGS);
    await runStage(ARGS);
    await runStage(ARGS);

    // Uchta bosqich o'tdi, hujjat hali tayyor emas.
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("sifat bahosi charge'dan oldin yoziladi", async () => {
    await drive();
    expect(row.qualityScore).toBeGreaterThan(0);
  });
});
