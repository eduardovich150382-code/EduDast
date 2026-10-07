import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsufficientCredits } from "@/lib/credits/errors";

/**
 * `server/generation-actions.ts` — CLAUDE.md 8-qoida (har server action =
 * yangi test) va 6-qoida (auth Zod'dan OLDIN).
 *
 * ENG MUHIM TEKSHIRUV: `hold` va `Document.create` BITTA tranzaksiyada.
 * Ikkinchisi yiqilsa hech narsa qolmasligi kerak — aks holda kredit band
 * bo'lgan, lekin hujjati yo'q "yetim hold" paydo bo'lardi va uni hech kim
 * bo'shata olmasdi (`release` hujjat qatorini talab qiladi).
 */

class RedirectSentinel extends Error {
  constructor() {
    super("REDIRECT");
    this.name = "RedirectSentinel";
  }
}

const mocks = vi.hoisted(() => ({
  requireOnboarded: vi.fn(),
  topicFindFirst: vi.fn(),
  documentCreate: vi.fn(),
  transaction: vi.fn(),
  hold: vi.fn(),
  resolveContextChunks: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  requireOnboarded: () => {
    mocks.calls.push("requireOnboarded");
    return mocks.requireOnboarded();
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    topic: { findFirst: mocks.topicFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/credits/ledger", () => ({ hold: mocks.hold }));
vi.mock("@/lib/generation/retrieval", () => ({
  resolveContextChunks: mocks.resolveContextChunks,
}));

const USER = { id: "u-1", subjects: ["fizika"], grades: [7, 8] };

const TOPIC = {
  id: "t-1",
  grade: 7,
  titleUz: "Tezlanish",
  subject: { slug: "fizika" },
};

const INPUT = { type: "LESSON_PLAN", topicId: "t-1", durationMinutes: 45 };

/** Test generatsiyasining tipik kirishi (10-sessiya). */
const TEST_INPUT = {
  type: "TEST",
  topicId: "t-1",
  questionCount: 10,
  kinds: ["mcq", "short"],
  difficulty: "mixed",
};

function wireHappyPath(): void {
  mocks.requireOnboarded.mockResolvedValue(USER);
  mocks.topicFindFirst.mockResolvedValue(TOPIC);
  mocks.resolveContextChunks.mockResolvedValue(["c-1", "c-2"]);
  mocks.hold.mockResolvedValue(undefined);
  mocks.documentCreate.mockResolvedValue({ id: "d-1" });
  // Interaktiv tranzaksiya: callback'ni `tx` klienti bilan chaqiradi.
  mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ document: { create: mocks.documentCreate } }),
  );
}

function denyAuth(): void {
  mocks.requireOnboarded.mockImplementation(() => {
    throw new RedirectSentinel();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
});

describe("qorovul Zod'dan OLDIN (CLAUDE.md 6-qoida)", () => {
  it("kirmagan foydalanuvchi redirect oladi", async () => {
    denyAuth();
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await expect(boshlaGeneratsiya(INPUT)).rejects.toThrow(RedirectSentinel);
  });

  it("axlat input'da ham AVVAL qorovul chaqiriladi", async () => {
    // Tartib muhim: kirmagan chaqiruvchi sxema haqida hech narsa
    // bilmasligi kerak.
    denyAuth();
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await expect(boshlaGeneratsiya({ nima: "bu" })).rejects.toThrow(RedirectSentinel);
    expect(mocks.calls).toEqual(["requireOnboarded"]);
  });

  it("qorovul yiqilsa baza umuman o'qilmaydi", async () => {
    denyAuth();
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await expect(boshlaGeneratsiya(INPUT)).rejects.toThrow();
    expect(mocks.topicFindFirst).not.toHaveBeenCalled();
    expect(mocks.hold).not.toHaveBeenCalled();
  });
});

describe("validatsiya", () => {
  beforeEach(wireHappyPath);

  it.each([
    ["bo'sh obyekt", {}],
    ["tur yo'q", { topicId: "t-1", durationMinutes: 45 }],
    ["noma'lum tur", { type: "GUIDE", topicId: "t-1", durationMinutes: 45 }],
    ["topicId yo'q", { type: "LESSON_PLAN", durationMinutes: 45 }],
    ["davomiylik yo'q", { type: "LESSON_PLAN", topicId: "t-1" }],
    ["davomiylik juda qisqa", { ...INPUT, durationMinutes: 10 }],
    ["davomiylik juda uzun", { ...INPUT, durationMinutes: 240 }],
    ["davomiylik kasr", { ...INPUT, durationMinutes: 45.5 }],
    ["davomiylik satr", { ...INPUT, durationMinutes: "45" }],
    ["topicId bo'sh", { ...INPUT, topicId: "" }],
    // TEST turining chegaralari — `UNIT_LIMITS.TEST` dan o'qiladi.
    ["savol soni juda kam", { ...TEST_INPUT, questionCount: 4 }],
    ["savol soni juda ko'p", { ...TEST_INPUT, questionCount: 41 }],
    ["savol soni kasr", { ...TEST_INPUT, questionCount: 10.5 }],
    ["savol turlari bo'sh", { ...TEST_INPUT, kinds: [] }],
    ["noma'lum savol turi", { ...TEST_INPUT, kinds: ["essay"] }],
    ["noma'lum qiyinlik", { ...TEST_INPUT, difficulty: "qiyin" }],
    ["savol soni yo'q", { type: "TEST", topicId: "t-1", kinds: ["mcq"], difficulty: "mixed" }],
    ["null", null],
  ])("%s rad etiladi", async (_name, input) => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("Zod xato MATNI qaytarilmaydi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya({ ...INPUT, durationMinutes: 5 });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });
});

describe("mavzu tekshiruvi", () => {
  beforeEach(wireHappyPath);

  it("mavjud bo'lmagan mavzu rad etiladi", async () => {
    mocks.topicFindFirst.mockResolvedValue(null);
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(INPUT)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("o'chirilgan mavzu so'rovda filtrlanadi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await boshlaGeneratsiya(INPUT);
    const where = mocks.topicFindFirst.mock.calls[0]?.[0]?.where as { deletedAt: null };
    expect(where.deletedAt).toBeNull();
  });

  it("begona FAN rad etiladi — kredit band qilinmaydi", async () => {
    mocks.topicFindFirst.mockResolvedValue({ ...TOPIC, subject: { slug: "kimyo" } });
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(INPUT)).toEqual({ ok: false, error: "ruxsat" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("begona SINF rad etiladi", async () => {
    mocks.topicFindFirst.mockResolvedValue({ ...TOPIC, grade: 11 });
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(INPUT)).toEqual({ ok: false, error: "ruxsat" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });
});

describe("kredit va tranzaksiya", () => {
  beforeEach(wireHappyPath);

  it("muvaffaqiyatda documentId qaytaradi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya(INPUT);
    expect(result.ok).toBe(true);
  });

  it("hold va create BITTA tranzaksiyada, bir xil id bilan", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya(INPUT);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const holdArgs = mocks.hold.mock.calls[0] as [string, number, string, unknown];
    const created = mocks.documentCreate.mock.calls[0]?.[0]?.data as {
      id: string;
      creditsHeldFor: number;
    };

    expect(holdArgs[0]).toBe(USER.id);
    // `LESSON_PLAN` bazis narxi — `lib/credits/cost-table.ts`.
    expect(holdArgs[1]).toBe(5);
    expect(created.creditsHeldFor).toBe(5);
    // `hold` ga uzatilgan id AYNAN yaratilgan hujjatniki bo'lishi shart,
    // aks holda `release` keyinchalik boshqa qatorni qidirardi.
    expect(holdArgs[2]).toBe(created.id);
    expect(result.ok && result.documentId).toBe(created.id);
  });

  it("kredit yetmasa Document YARATILMAYDI", async () => {
    mocks.hold.mockRejectedValue(
      new InsufficientCredits({ userId: USER.id, amount: 5, documentId: "d-1" }),
    );
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");

    expect(await boshlaGeneratsiya(INPUT)).toEqual({ ok: false, error: "kredit" });
    expect(mocks.documentCreate).not.toHaveBeenCalled();
  });

  it("create yiqilsa tranzaksiya tashlanadi — yetim hold qolmaydi", async () => {
    // Haqiqiy Postgres'da rollback `hold` ni ham bekor qiladi. Bu yerda
    // tekshiriladigan narsa: ikkalasi AYNI `$transaction` callback'ida,
    // ya'ni rollback ikkalasini ham qamraydi.
    mocks.documentCreate.mockRejectedValue(new Error("baza uzildi"));
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");

    await expect(boshlaGeneratsiya(INPUT)).rejects.toThrow("baza uzildi");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.hold).toHaveBeenCalledTimes(1);
  });

  it("kutilmagan xato YASHIRILMAYDI", async () => {
    mocks.transaction.mockRejectedValue(new Error("tarmoq uzildi"));
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await expect(boshlaGeneratsiya(INPUT)).rejects.toThrow("tarmoq uzildi");
  });
});

describe("boshlang'ich hujjat holati", () => {
  beforeEach(wireHappyPath);

  it("QUEUED, bo'sh kontent va progress bilan yaratiladi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await boshlaGeneratsiya(INPUT);

    const data = mocks.documentCreate.mock.calls[0]?.[0]?.data as {
      status: string;
      type: string;
      contentJson: unknown;
      inputParams: { progress: unknown; contextChunkIds: string[]; durationMinutes: number };
    };

    expect(data.status).toBe("QUEUED");
    expect(data.type).toBe("LESSON_PLAN");
    // `{}` EMAS: `commitStage` dagi jsonb append mavjud massivni talab
    // qiladi va `v` kontent versiyasini qayd etadi.
    expect(data.contentJson).toEqual({ v: 1, blocks: [] });
    // `progress` obyekti SHU YERDA yaratilishi shart — `jsonb_set` oxirgi
    // kalitni yaratadi, ota obyektni emas.
    expect(data.inputParams.progress).toEqual({ stage: 0, total: 3, attempts: 0 });
    expect(data.inputParams.contextChunkIds).toEqual(["c-1", "c-2"]);
    expect(data.inputParams.durationMinutes).toBe(45);
  });

  it("kontekst TRANZAKSIYADAN TASHQARIDA hal qilinadi", async () => {
    // Embedding — tarmoq chaqiruvi. Tranzaksiya ichida bo'lsa Prisma
    // 5 soniyalik shiftga uriladi (P2028).
    const order: string[] = [];
    mocks.resolveContextChunks.mockImplementation(() => {
      order.push("context");
      return Promise.resolve([]);
    });
    mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      order.push("transaction");
      return fn({ document: { create: mocks.documentCreate } });
    });

    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    await boshlaGeneratsiya(INPUT);

    expect(order).toEqual(["context", "transaction"]);
  });
});

/* ------------------------------------------------------------------ */
/* TEST turi (10-sessiya)                                             */
/* ------------------------------------------------------------------ */

describe("TEST turi", () => {
  beforeEach(wireHappyPath);

  type CreateData = {
    type: string;
    title: string;
    creditsHeldFor: number;
    inputParams: {
      progress: { stage: number; total: number; attempts: number };
      questionCount: number;
      kinds: string[];
      difficulty: string;
      durationMinutes?: number;
    };
  };

  async function create(input: unknown): Promise<CreateData> {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya(input);
    expect(result.ok).toBe(true);
    return mocks.documentCreate.mock.calls[0]?.[0]?.data as CreateData;
  }

  it("TEST hujjati o'z turi va nomi bilan yaratiladi", async () => {
    const data = await create(TEST_INPUT);
    expect(data.type).toBe("TEST");
    expect(data.title).toContain("test");
  });

  it("inputParams da savol parametrlari, davomiylik YO'Q", async () => {
    // Dars davomiyligi testda ma'nosiz — `run-stage` uni talab qilmaydi.
    const data = await create(TEST_INPUT);
    expect(data.inputParams.questionCount).toBe(10);
    expect(data.inputParams.kinds).toEqual(["mcq", "short"]);
    expect(data.inputParams.difficulty).toBe("mixed");
    expect(data.inputParams.durationMinutes).toBeUndefined();
  });

  it("narx savol soniga qarab band qilinadi", async () => {
    const { creditCost } = await import("@/lib/credits/cost-table");
    const data = await create({ ...TEST_INPUT, questionCount: 40 });
    const expected = creditCost({ type: "TEST", questionCount: 40 });

    expect(data.creditsHeldFor).toBe(expected);
    expect(mocks.hold).toHaveBeenCalledWith("u-1", expected, expect.any(String), expect.anything());
    // Ko'p savol — qimmatroq: narx jadvalining monoton kafolati.
    expect(expected).toBeGreaterThan(creditCost({ type: "TEST", questionCount: 5 }));
  });

  it("progress.total rejadan olinadi — testda u BOSHIDAN aniq", async () => {
    // 20 tagacha uch bosqich, undan ko'pi 2a/2b ga bo'linadi.
    const kichik = await create(TEST_INPUT);
    expect(kichik.inputParams.progress).toEqual({ stage: 0, total: 3, attempts: 0 });

    mocks.documentCreate.mockClear();
    const katta = await create({ ...TEST_INPUT, questionCount: 40 });
    expect(katta.inputParams.progress.total).toBe(4);
  });

  it("ruxsat tekshiruvi TEST uchun ham ishlaydi — kredit band qilinmaydi", async () => {
    mocks.topicFindFirst.mockResolvedValue({
      id: "t-1",
      grade: 11,
      titleUz: "Tezlanish",
      subject: { slug: "fizika" },
    });
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");

    expect(await boshlaGeneratsiya(TEST_INPUT)).toEqual({ ok: false, error: "ruxsat" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* SLIDES turi (14-sessiya)                                           */
/* ------------------------------------------------------------------ */

describe("SLIDES turi", () => {
  beforeEach(wireHappyPath);

  const SLIDES_INPUT = { type: "SLIDES", topicId: "t-1", slideCount: 12 };

  type CreateData = {
    type: string;
    title: string;
    creditsHeldFor: number;
    inputParams: {
      progress: { stage: number; total: number; attempts: number };
      slideCount: number;
      durationMinutes?: number;
      questionCount?: number;
    };
  };

  async function create(input: unknown): Promise<CreateData> {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya(input);
    expect(result.ok).toBe(true);
    return mocks.documentCreate.mock.calls[0]?.[0]?.data as CreateData;
  }

  it("SLIDES hujjati o'z turi va nomi bilan yaratiladi", async () => {
    const data = await create(SLIDES_INPUT);
    expect(data.type).toBe("SLIDES");
    expect(data.title).toContain("taqdimot");
  });

  it("inputParams da faqat slayd soni — davomiylik va savol soni YO'Q", async () => {
    // Ikkisi ham taqdimotda ma'nosiz; `SlidesParams` ularni talab qilmaydi.
    const data = await create(SLIDES_INPUT);
    expect(data.inputParams.slideCount).toBe(12);
    expect(data.inputParams.durationMinutes).toBeUndefined();
    expect(data.inputParams.questionCount).toBeUndefined();
  });

  it("narx slayd soniga qarab band qilinadi", async () => {
    const { creditCost } = await import("@/lib/credits/cost-table");
    const data = await create({ ...SLIDES_INPUT, slideCount: 20 });
    const expected = creditCost({ type: "SLIDES", slideCount: 20 });

    expect(data.creditsHeldFor).toBe(expected);
    expect(mocks.hold).toHaveBeenCalledWith("u-1", expected, expect.any(String), expect.anything());
    expect(expected).toBeGreaterThan(creditCost({ type: "SLIDES", slideCount: 6 }));
  });

  it("progress.total HAR DOIM 3 — reja shartsiz bo'linadi", async () => {
    const kichik = await create(SLIDES_INPUT);
    expect(kichik.inputParams.progress).toEqual({ stage: 0, total: 3, attempts: 0 });

    mocks.documentCreate.mockClear();
    const katta = await create({ ...SLIDES_INPUT, slideCount: 20 });
    expect(katta.inputParams.progress.total).toBe(3);
  });

  it.each([
    ["slayd soni juda kam", { ...SLIDES_INPUT, slideCount: 5 }],
    ["slayd soni juda ko'p", { ...SLIDES_INPUT, slideCount: 21 }],
    ["slayd soni kasr", { ...SLIDES_INPUT, slideCount: 12.5 }],
    ["slayd soni yo'q", { type: "SLIDES", topicId: "t-1" }],
  ])("%s rad etiladi", async (_label, input) => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("ruxsat tekshiruvi SLIDES uchun ham ishlaydi — kredit band qilinmaydi", async () => {
    mocks.topicFindFirst.mockResolvedValue({
      id: "t-1",
      grade: 11,
      titleUz: "Tezlanish",
      subject: { slug: "fizika" },
    });
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");

    expect(await boshlaGeneratsiya(SLIDES_INPUT)).toEqual({ ok: false, error: "ruxsat" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });
});
describe("GAME turi", () => {
  beforeEach(wireHappyPath);

  const GAME_INPUT = {
    type: "GAME",
    topicId: "t-1",
    gameKind: "word-search",
    itemCount: 10,
  };

  type CreateData = {
    type: string;
    title: string;
    creditsHeldFor: number;
    inputParams: {
      progress: { stage: number; total: number; attempts: number };
      gameKind: string;
      itemCount: number;
      durationMinutes?: number;
      questionCount?: number;
      slideCount?: number;
    };
  };

  async function create(input: unknown): Promise<CreateData> {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya(input);
    expect(result.ok).toBe(true);
    return mocks.documentCreate.mock.calls[0]?.[0]?.data as CreateData;
  }

  it("GAME hujjati o'z turi va nomi bilan yaratiladi", async () => {
    const data = await create(GAME_INPUT);
    expect(data.type).toBe("GAME");
    expect(data.title).toContain("o'yin");
  });

  it("inputParams da o'yin parametrlari, boshqa turlarning maydoni YO'Q", async () => {
    const data = await create(GAME_INPUT);
    expect(data.inputParams.gameKind).toBe("word-search");
    expect(data.inputParams.itemCount).toBe(10);
    expect(data.inputParams.durationMinutes).toBeUndefined();
    expect(data.inputParams.questionCount).toBeUndefined();
    expect(data.inputParams.slideCount).toBeUndefined();
  });

  it("narx kind VA element soniga qarab band qilinadi", async () => {
    const { creditCost } = await import("@/lib/credits/cost-table");
    // 12 — so'z qidirishdagi eng yuqori son (`GAME_LIMITS`). 14 edi,
    // lekin panjara sig'imi (112 harf) tufayli tushirildi.
    const data = await create({ ...GAME_INPUT, itemCount: 12 });
    const expected = creditCost({ type: "GAME", gameKind: "word-search", itemCount: 12 });

    expect(data.creditsHeldFor).toBe(expected);
    expect(mocks.hold).toHaveBeenCalledWith("u-1", expected, expect.any(String), expect.anything());
    expect(expected).toBeGreaterThan(
      creditCost({ type: "GAME", gameKind: "word-search", itemCount: 8 }),
    );
  });

  it("progress.total bitta bosqich — reja parametrga bog'liq EMAS", async () => {
    for (const itemCount of [8, 10, 12]) {
      mocks.documentCreate.mockClear();
      const data = await create({ ...GAME_INPUT, itemCount });
      expect(data.inputParams.progress).toEqual({ stage: 0, total: 1, attempts: 0 });
    }
  });

  it("g'ildirakda 8 dan boshqa son RAD ETILADI", async () => {
    // Chegara `kind` ga bog'liq (`startSchema` dagi `superRefine`): tekis
    // chegara bo'lsa 6 sektorli g'ildirak generatsiyaning oxirida
    // yiqilardi — kredit band qilingandan keyin.
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya({
      ...GAME_INPUT,
      gameKind: "wheel",
      itemCount: 6,
    });

    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("noma'lum o'yin turi rad etiladi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya({ ...GAME_INPUT, gameKind: "crossword" });

    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("har kind o'z chegarasida yaratiladi", async () => {
    const { GAME_LIMITS } = await import("@/lib/credits/cost-table");
    const { GAME_KINDS } = await import("@/lib/games/types");

    for (const gameKind of GAME_KINDS) {
      mocks.documentCreate.mockClear();
      const data = await create({
        ...GAME_INPUT,
        gameKind,
        itemCount: GAME_LIMITS[gameKind].min,
      });
      expect(data.inputParams.gameKind, gameKind).toBe(gameKind);
      expect(data.creditsHeldFor, gameKind).toBeGreaterThan(0);
    }
  });
});
