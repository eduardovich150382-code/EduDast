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

const INPUT = { topicId: "t-1", durationMinutes: 45 };

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
    ["topicId yo'q", { durationMinutes: 45 }],
    ["davomiylik yo'q", { topicId: "t-1" }],
    ["davomiylik juda qisqa", { topicId: "t-1", durationMinutes: 10 }],
    ["davomiylik juda uzun", { topicId: "t-1", durationMinutes: 240 }],
    ["davomiylik kasr", { topicId: "t-1", durationMinutes: 45.5 }],
    ["davomiylik satr", { topicId: "t-1", durationMinutes: "45" }],
    ["topicId bo'sh", { topicId: "", durationMinutes: 45 }],
    ["null", null],
  ])("%s rad etiladi", async (_name, input) => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    expect(await boshlaGeneratsiya(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.hold).not.toHaveBeenCalled();
  });

  it("Zod xato MATNI qaytarilmaydi", async () => {
    const { boshlaGeneratsiya } = await import("@/server/generation-actions");
    const result = await boshlaGeneratsiya({ topicId: "t-1", durationMinutes: 5 });
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
