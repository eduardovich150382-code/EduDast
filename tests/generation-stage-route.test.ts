import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "@/lib/llm/errors";

/**
 * `lib/generation/run-stage.ts` — konveyerning orkestratsiyasi.
 *
 * Bu yerda POSTGRES semantikasi SINALMAYDI (u
 * `tests/integration/generation-lifecycle.test.ts` da, haqiqiy bazada —
 * parallel claim/commit, ijara, kursor). Bu fayl boshqa savolga javob
 * beradi: qaysi vaziyatda PUL sarflanadi va qaysi vaziyatda qaytariladi.
 *
 * Eng qimmat xato — LLM chaqiruvini kerak bo'lmagan joyda qilish, shuning
 * uchun testlarning ko'pi "runLlm CHAQIRILMADI" ni tekshiradi.
 */

const mocks = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
  documentUpdateMany: vi.fn(),
  claimStage: vi.fn(),
  commitStage: vi.fn(),
  charge: vi.fn(),
  release: vi.fn(),
  runLlm: vi.fn(),
  buildTopicContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: mocks.documentFindFirst, updateMany: mocks.documentUpdateMany },
  },
}));

vi.mock("@/lib/documents/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/documents/lifecycle")>();
  return { ...actual, claimStage: mocks.claimStage, commitStage: mocks.commitStage };
});

vi.mock("@/lib/credits/ledger", () => ({ charge: mocks.charge, release: mocks.release }));
vi.mock("@/lib/generation/retrieval", () => ({ buildTopicContext: mocks.buildTopicContext }));

vi.mock("@/lib/llm", async () => {
  const errors = await import("@/lib/llm/errors");
  return { runLlm: mocks.runLlm, isLlmError: errors.isLlmError, LlmError: errors.LlmError };
});

const TOPIC = {
  grade: 7,
  objectives: ["Tezlanishni hisoblaydi"],
  keywords: ["tezlanish"],
  subject: { nameUz: "Fizika" },
};

const SKELETON = {
  title: "Tezlanish",
  objectives: ["Tezlanishni ta'riflaydi", "Tezlanishni hisoblaydi"],
  materials: ["Doska"],
  stages: [
    { title: "Kirish", minutes: 15 },
    { title: "Bayon", minutes: 20 },
    { title: "Yakun", minutes: 10 },
  ],
};

function params(overrides: Record<string, unknown> = {}) {
  return {
    durationMinutes: 45,
    contextChunkIds: ["c-1"],
    progress: { stage: 0, total: 3, attempts: 0 },
    ...overrides,
  };
}

function wireDocument(overrides: Record<string, unknown> = {}) {
  mocks.documentFindFirst.mockResolvedValue({
    status: "QUEUED",
    topicId: "t-1",
    inputParams: params(),
    topic: TOPIC,
    ...overrides,
  });
}

function wireClaim(attempts = 1) {
  mocks.claimStage.mockResolvedValue({
    topicId: "t-1",
    creditsHeldFor: 5,
    inputParams: params(),
    attempts,
  });
}

function llmResult<T>(data: T) {
  return {
    data,
    model: "fake",
    provider: "fake",
    usage: { tokensIn: 10, tokensOut: 20, cacheRead: 0, cacheWrite: 0 },
    costUsd: "0.000100",
    llmCallId: "l-1",
  };
}

const ARGS = { documentId: "d-1", userId: "u-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildTopicContext.mockResolvedValue("## Kurikulum konteksti");
  mocks.commitStage.mockResolvedValue(true);
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.charge.mockResolvedValue(95);
  mocks.release.mockResolvedValue(undefined);
});

describe("hujjat holati", () => {
  it("topilmasa notFound — LLM chaqirilmaydi", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);
    const { runStage } = await import("@/lib/generation/run-stage");
    expect(await runStage(ARGS)).toEqual({ kind: "notFound" });
    expect(mocks.runLlm).not.toHaveBeenCalled();
  });

  it("DONE hujjat qayta ishlanmaydi", async () => {
    wireDocument({ status: "DONE" });
    const { runStage } = await import("@/lib/generation/run-stage");
    expect(await runStage(ARGS)).toEqual({ kind: "complete" });
    expect(mocks.claimStage).not.toHaveBeenCalled();
    expect(mocks.runLlm).not.toHaveBeenCalled();
  });

  it("FAILED hujjat ustidan charge urinilmaydi", async () => {
    wireDocument({ status: "FAILED" });
    const { runStage } = await import("@/lib/generation/run-stage");
    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("failed");
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.runLlm).not.toHaveBeenCalled();
  });
});

describe("egallash darvozasi", () => {
  it("egallay olmasa busy — LLM chaqirilmaydi", async () => {
    wireDocument();
    mocks.claimStage.mockResolvedValue(null);
    const { runStage } = await import("@/lib/generation/run-stage");

    expect(await runStage(ARGS)).toEqual({ kind: "busy" });
    // Aynan shu yerda ikkinchi parallel so'rovning puli tejaladi.
    expect(mocks.runLlm).not.toHaveBeenCalled();
  });

  it("urinishlar shifti oshsa LLM'GA UMUMAN BORILMAYDI", async () => {
    wireDocument();
    wireClaim(4); // MAX_ATTEMPTS = 3
    const { runStage } = await import("@/lib/generation/run-stage");

    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("failed");
    expect(mocks.runLlm).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("u-1", 5, "d-1", expect.stringContaining("3x"));
  });

  it("uchinchi urinish HALI ham bajariladi", async () => {
    wireDocument();
    wireClaim(3);
    mocks.runLlm.mockResolvedValue(llmResult(SKELETON));
    const { runStage } = await import("@/lib/generation/run-stage");

    expect((await runStage(ARGS)).kind).toBe("advanced");
    expect(mocks.runLlm).toHaveBeenCalledTimes(1);
  });

  it("commitStage yutqazsa natija TASHLANADI, kredit yechilmaydi", async () => {
    wireDocument();
    wireClaim();
    mocks.runLlm.mockResolvedValue(llmResult(SKELETON));
    mocks.commitStage.mockResolvedValue(false);
    const { runStage } = await import("@/lib/generation/run-stage");

    expect(await runStage(ARGS)).toEqual({ kind: "busy" });
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});

describe("1-bosqich", () => {
  beforeEach(() => {
    wireDocument();
    wireClaim();
  });

  it("bitta runLlm chaqiradi", async () => {
    mocks.runLlm.mockResolvedValue(llmResult(SKELETON));
    const { runStage } = await import("@/lib/generation/run-stage");
    await runStage(ARGS);
    // 60 soniyalik shift: bitta chaqiruvdan ko'pi sig'maydi.
    expect(mocks.runLlm).toHaveBeenCalledTimes(1);
  });

  it("kesh tartibi: muzlatilgan qism -> kontekst -> parametrlar", async () => {
    mocks.runLlm.mockResolvedValue(llmResult(SKELETON));
    const { runStage } = await import("@/lib/generation/run-stage");
    await runStage(ARGS);

    const request = mocks.runLlm.mock.calls[0]?.[0] as {
      system: { text: string; cacheable?: boolean }[];
      messages: { content: string }[];
      documentId: string;
      purpose: string;
    };

    expect(request.system).toHaveLength(3);
    expect(request.system[0]?.cacheable).toBe(true);
    expect(request.system[1]?.cacheable).toBe(true);
    // O'qituvchi parametrlari kesh chegarasidan KEYIN.
    expect(request.system[2]?.cacheable).toBeUndefined();
    expect(request.system[2]?.text).toContain("45 daqiqa");
    // Bosqichga xos ko'rsatma `messages` da — `system` prefiksini buzmaydi.
    expect(request.messages[0]?.content).toContain("SKELETINI");
    expect(request.purpose).toBe("lesson-plan:stage-1");
    // A/B taqsimoti: hujjatning hamma bosqichi bir provayderga tushsin.
    expect(request.documentId).toBe("d-1");
  });

  it("skeletni inputParams ga yozadi va total ni aniqlaydi", async () => {
    mocks.runLlm.mockResolvedValue(llmResult(SKELETON));
    const { runStage } = await import("@/lib/generation/run-stage");
    expect(await runStage(ARGS)).toEqual({ kind: "advanced", stage: 1, total: 3 });

    const commit = mocks.commitStage.mock.calls[0]?.[1] as {
      paramsPatch: { skeleton: unknown };
      progressPatch: { total: number };
      blocks: { type: string }[];
    };
    expect(commit.paramsPatch.skeleton).toEqual(SKELETON);
    expect(commit.progressPatch.total).toBe(3);
    expect(commit.blocks.map((b) => b.type)).toEqual(["heading", "objectives", "materials"]);
  });

  it("og'ir skelet total ni 4 ga oshiradi (2a/2b)", async () => {
    const heavy = {
      ...SKELETON,
      stages: Array.from({ length: 8 }, (_, i) => ({ title: `B${String(i)}`, minutes: 11 })),
    };
    mocks.documentFindFirst.mockResolvedValue({
      status: "QUEUED",
      topicId: "t-1",
      inputParams: params({ durationMinutes: 90 }),
      topic: TOPIC,
    });
    mocks.runLlm.mockResolvedValue(llmResult(heavy));
    const { runStage } = await import("@/lib/generation/run-stage");

    expect(await runStage(ARGS)).toEqual({ kind: "advanced", stage: 1, total: 4 });
  });

  it("buzuq skelet DARHOL release — 2 va 3-bosqichga pul ketmaydi", async () => {
    // 3 x 5 = 15 daqiqa, so'ralgani 45 -> 67 % chetlanish.
    const broken = {
      ...SKELETON,
      stages: SKELETON.stages.map((s) => ({ ...s, minutes: 5 })),
    };
    mocks.runLlm.mockResolvedValue(llmResult(broken));
    const { runStage } = await import("@/lib/generation/run-stage");

    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("failed");
    expect(mocks.commitStage).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("u-1", 5, "d-1", expect.stringContaining("skelet"));
  });
});

describe("mazmun bosqichi", () => {
  beforeEach(() => {
    mocks.documentFindFirst.mockResolvedValue({
      status: "RUNNING",
      topicId: "t-1",
      inputParams: params({ progress: { stage: 1, total: 3, attempts: 0 }, skeleton: SKELETON }),
      topic: TOPIC,
    });
    wireClaim();
  });

  it("nom va daqiqa SKELETDAN olinadi, model javobidan emas", async () => {
    mocks.runLlm.mockResolvedValue(
      llmResult({
        stages: SKELETON.stages.map(() => ({
          // Model nomni va daqiqani "yaxshilab" o'zgartirgan.
          title: "Model o'ylab topgan nom",
          minutes: 99,
          teacherActions: ["Tushuntiradi"],
          studentActions: ["Yozadi"],
        })),
      }),
    );
    const { runStage } = await import("@/lib/generation/run-stage");
    await runStage(ARGS);

    const commit = mocks.commitStage.mock.calls[0]?.[1] as {
      blocks: { items: { title: string; minutes: number }[] }[];
    };
    const items = commit.blocks[0]!.items;
    expect(items.map((i) => i.title)).toEqual(["Kirish", "Bayon", "Yakun"]);
    expect(items.map((i) => i.minutes)).toEqual([15, 20, 10]);
    // Daqiqa yig'indisi skeletnikiga teng — sifat bahosi buzilmaydi.
    expect(items.reduce((sum, i) => sum + i.minutes, 0)).toBe(45);
  });

  it("model kam bosqich qaytarsa release", async () => {
    mocks.runLlm.mockResolvedValue(
      llmResult({
        stages: [{ title: "Bir", minutes: 15, teacherActions: ["A"], studentActions: ["B"] }],
      }),
    );
    const { runStage } = await import("@/lib/generation/run-stage");

    expect((await runStage(ARGS)).kind).toBe("failed");
    expect(mocks.commitStage).not.toHaveBeenCalled();
  });
});

describe("xato tasnifi", () => {
  beforeEach(() => {
    wireDocument();
    wireClaim();
  });

  it.each([
    ["rate_limit"],
    ["overloaded"],
    ["unknown"],
  ])("%s — kredit BAND qoladi, qayta urinish mumkin", async (kind) => {
    mocks.runLlm.mockRejectedValue(new LlmError(kind as "unknown", "vaqtinchalik"));
    const { runStage } = await import("@/lib/generation/run-stage");

    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("retry");
    // `release` YO'Q: ijara bo'shagach ayni bosqich qayta egallanadi.
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_output"],
    ["refusal"],
    ["budget"],
    ["disabled"],
    ["not_configured"],
  ])("%s — terminal, kredit DARHOL qaytariladi", async (kind) => {
    mocks.runLlm.mockRejectedValue(new LlmError(kind as "budget", "terminal xato"));
    const { runStage } = await import("@/lib/generation/run-stage");

    expect((await runStage(ARGS)).kind).toBe("failed");
    expect(mocks.release).toHaveBeenCalledWith("u-1", 5, "d-1", expect.stringContaining(kind));
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("release ga claimStage qaytargan creditsHeldFor uzatiladi", async () => {
    // `creditCost()` dan QAYTA hisoblanmaydi: narx jadvali o'zgarsa eski
    // hujjatlar noto'g'ri qaytarilardi.
    mocks.claimStage.mockResolvedValue({
      topicId: "t-1",
      creditsHeldFor: 7,
      inputParams: params(),
      attempts: 1,
    });
    mocks.runLlm.mockRejectedValue(new LlmError("refusal", "rad etildi"));
    const { runStage } = await import("@/lib/generation/run-stage");

    await runStage(ARGS);
    expect(mocks.release).toHaveBeenCalledWith("u-1", 7, "d-1", expect.any(String));
  });
});

describe("yakunlash", () => {
  const GOOD_CONTENT = {
    v: 1,
    blocks: [
      { id: "s1-heading-0", type: "heading", level: 1, text: "Tezlanish" },
      {
        id: "s1-objectives-0",
        type: "objectives",
        items: ["Tezlanishni formula bilan hisoblaydi"],
      },
      { id: "s1-materials-0", type: "materials", items: ["Doska"] },
      {
        id: "s2-stages-0",
        type: "stages",
        items: [
          {
            title: "Kirish",
            minutes: 20,
            teacherActions: ["Tezlanish formulasini doskada chiqaradi"],
            studentActions: ["Formulani daftarga yozib misol yechadi"],
          },
          {
            title: "Yakun",
            minutes: 25,
            teacherActions: ["Harakat turlarini taqqoslashni so'raydi"],
            studentActions: ["Tezlikni hisoblab javobni tekshiradi"],
          },
        ],
      },
      {
        id: "s3-homework-0",
        type: "homework",
        items: ["Darslikdagi 12-mashqni yeching va tezlanishni toping"],
      },
    ],
  };

  function wireLastStage(contentJson: unknown) {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        status: "RUNNING",
        topicId: "t-1",
        inputParams: params({ progress: { stage: 2, total: 3, attempts: 0 }, skeleton: SKELETON }),
        topic: TOPIC,
      })
      .mockResolvedValueOnce({ contentJson, creditsHeldFor: 5 });
    wireClaim();
    mocks.runLlm.mockResolvedValue(
      llmResult({
        homework: { items: ["12-mashqni yeching"], estimatedMinutes: 20 },
        rubric: {
          criteria: [
            { name: "Faollik", maxPoints: 5, descriptors: ["Javob berdi"] },
            { name: "Aniqlik", maxPoints: 5, descriptors: ["Xatosiz"] },
          ],
        },
        notes: [{ tone: "tip", text: "Kuchsizroq o'quvchiga formula bering." }],
      }),
    );
  }

  it("sifat o'tsa charge chaqiriladi va ball yoziladi", async () => {
    wireLastStage(GOOD_CONTENT);
    const { runStage } = await import("@/lib/generation/run-stage");

    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("done");
    expect(mocks.charge).toHaveBeenCalledWith("u-1", 5, "d-1");
    expect(mocks.release).not.toHaveBeenCalled();

    // Ball `charge` dan OLDIN yoziladi: `charge` statusni DONE qiladi,
    // shundan keyin `status: RUNNING` sharti bilan yozib bo'lmasdi.
    const update = mocks.documentUpdateMany.mock.calls[0]?.[0] as {
      where: { status: string };
      data: { qualityScore: number };
    };
    expect(update.where.status).toBe("RUNNING");
    expect(update.data.qualityScore).toBeGreaterThan(0);
  });

  it("sifat yiqilsa release, charge YO'Q", async () => {
    wireLastStage({ v: 1, blocks: [] });
    const { runStage } = await import("@/lib/generation/run-stage");

    const outcome = await runStage(ARGS);
    expect(outcome.kind).toBe("failed");
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("u-1", 5, "d-1", expect.stringContaining("sifat"));
  });

  it("kursor rejadan chiqib ketgan bo'lsa yakun tugatiladi", async () => {
    // Oxirgi bosqich commit bo'lgan, lekin jarayon charge'dan oldin o'lgan.
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        status: "RUNNING",
        topicId: "t-1",
        inputParams: params({ progress: { stage: 3, total: 3, attempts: 0 }, skeleton: SKELETON }),
        topic: TOPIC,
      })
      .mockResolvedValueOnce({ contentJson: GOOD_CONTENT, creditsHeldFor: 5 });

    const { runStage } = await import("@/lib/generation/run-stage");
    const outcome = await runStage(ARGS);

    expect(outcome.kind).toBe("done");
    expect(mocks.claimStage).not.toHaveBeenCalled();
    expect(mocks.runLlm).not.toHaveBeenCalled();
    expect(mocks.charge).toHaveBeenCalledTimes(1);
  });
});
