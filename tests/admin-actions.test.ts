import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/admin-actions.ts (CLAUDE.md 8-qoida: har server action = yangi test).
 *
 * Eng muhim tekshiruv: HAR BIR action o'zi `requireAdmin()` chaqiradi.
 * `app/[locale]/admin/layout.tsx` dagi qorovul action POST'ini to'smaydi,
 * shuning uchun bu jadval buzilsa admin paneli ochiq qolgan bo'lardi.
 */

/** `notFound()` — `never` qaytaradi; testda uni tashlanadigan belgi qilamiz. */
class NotFoundSentinel extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  subjectUpdateMany: vi.fn(),
  topicUpdateMany: vi.fn(),
  topicCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    subject: { updateMany: mocks.subjectUpdateMany },
    topic: { updateMany: mocks.topicUpdateMany, count: mocks.topicCount },
  },
}));

const VALID_TOPIC = {
  id: "topic-1",
  titleUz: "Mexanik harakat",
  titleUzCyrl: "Механик ҳаракат",
  titleRu: "Механическое движение",
  order: 1,
  hoursPlan: 2,
  objectives: ["Birinchi maqsad"],
  keywords: ["harakat"],
};

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAdmin.mockImplementation(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", role: "ADMIN" };
  });
});

/** ADMIN bo'lmaganda `requireAdmin()` notFound() tashlaydi. */
function denyAdmin() {
  mocks.requireAdmin.mockImplementation(async () => {
    throw new NotFoundSentinel();
  });
}

describe("requireAdmin har action'da chaqiriladi", () => {
  it.each([
    ["toggleSubjectActive", { slug: "fizika", isActive: true }],
    ["updateTopic", VALID_TOPIC],
    ["deleteTopic", { id: "topic-1" }],
  ])("%s — ADMIN bo'lmasa hech narsa yozilmaydi", async (name, input) => {
    denyAdmin();
    const actions = (await import("@/server/admin-actions")) as Record<
      string,
      (input: unknown) => Promise<unknown>
    >;

    await expect(actions[name]!(input)).rejects.toThrow(NotFoundSentinel);

    expect(mocks.subjectUpdateMany).not.toHaveBeenCalled();
    expect(mocks.topicUpdateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("axlat input'da ham avval requireAdmin chaqiriladi", async () => {
    const { updateTopic } = await import("@/server/admin-actions");

    const result = await updateTopic({ nonsense: true });

    expect(calls).toEqual(["requireAdmin"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.topicUpdateMany).not.toHaveBeenCalled();
  });
});

describe("toggleSubjectActive", () => {
  it.each([
    ["slug yo'q", { isActive: true }],
    ["isActive satr", { slug: "fizika", isActive: "true" }],
    ["bo'sh slug", { slug: "", isActive: false }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { toggleSubjectActive } = await import("@/server/admin-actions");

    expect(await toggleSubjectActive(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.subjectUpdateMany).not.toHaveBeenCalled();
  });

  it("fanni faol qiladi va admin sahifalarini yangilaydi", async () => {
    mocks.subjectUpdateMany.mockResolvedValue({ count: 1 });
    const { toggleSubjectActive } = await import("@/server/admin-actions");

    const result = await toggleSubjectActive({ slug: "kimyo", isActive: true });

    expect(result).toEqual({ ok: true });
    expect(mocks.subjectUpdateMany).toHaveBeenCalledWith({
      where: { slug: "kimyo" },
      data: { isActive: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("fan topilmasa 'topilmadi' qaytaradi", async () => {
    mocks.subjectUpdateMany.mockResolvedValue({ count: 0 });
    const { toggleSubjectActive } = await import("@/server/admin-actions");

    expect(await toggleSubjectActive({ slug: "yoq", isActive: true })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateTopic", () => {
  it.each([
    ["sarlavha bo'sh", { ...VALID_TOPIC, titleUz: "  " }],
    ["order manfiy", { ...VALID_TOPIC, order: -1 }],
    ["order son emas", { ...VALID_TOPIC, order: "1" }],
    ["hoursPlan 0", { ...VALID_TOPIC, hoursPlan: 0 }],
    ["objectives satr", { ...VALID_TOPIC, objectives: "birinchi" }],
    ["id yo'q", { ...VALID_TOPIC, id: undefined }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { updateTopic } = await import("@/server/admin-actions");

    expect(await updateTopic(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.topicUpdateMany).not.toHaveBeenCalled();
  });

  it("hoursPlan null bo'lishi mumkin", async () => {
    mocks.topicUpdateMany.mockResolvedValue({ count: 1 });
    const { updateTopic } = await import("@/server/admin-actions");

    expect(await updateTopic({ ...VALID_TOPIC, hoursPlan: null })).toEqual({ ok: true });
  });

  it("o'chirilgan mavzuni tahrirlamaydi (deletedAt: null sharti)", async () => {
    mocks.topicUpdateMany.mockResolvedValue({ count: 1 });
    const { updateTopic } = await import("@/server/admin-actions");

    await updateTopic(VALID_TOPIC);

    expect(mocks.topicUpdateMany).toHaveBeenCalledWith({
      where: { id: "topic-1", deletedAt: null },
      data: {
        titleUz: "Mexanik harakat",
        titleUzCyrl: "Механик ҳаракат",
        titleRu: "Механическое движение",
        order: 1,
        hoursPlan: 2,
        objectives: ["Birinchi maqsad"],
        keywords: ["harakat"],
      },
    });
  });

  it("mavzu topilmasa (yoki o'chirilgan bo'lsa) 'topilmadi'", async () => {
    mocks.topicUpdateMany.mockResolvedValue({ count: 0 });
    const { updateTopic } = await import("@/server/admin-actions");

    expect(await updateTopic(VALID_TOPIC)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteTopic", () => {
  it("bolasi bor tugunni o'chirmaydi", async () => {
    mocks.topicCount.mockResolvedValue(3);
    const { deleteTopic } = await import("@/server/admin-actions");

    const result = await deleteTopic({ id: "bolim-1" });

    expect(result).toEqual({ ok: false, error: "bolasi-bor" });
    expect(mocks.topicCount).toHaveBeenCalledWith({
      where: { parentId: "bolim-1", deletedAt: null },
    });
    expect(mocks.topicUpdateMany).not.toHaveBeenCalled();
  });

  it("bargni soft delete qiladi (hard delete YO'Q)", async () => {
    mocks.topicCount.mockResolvedValue(0);
    mocks.topicUpdateMany.mockResolvedValue({ count: 1 });
    const { deleteTopic } = await import("@/server/admin-actions");

    const result = await deleteTopic({ id: "topic-1" });

    expect(result).toEqual({ ok: true });
    const call = mocks.topicUpdateMany.mock.calls[0]?.[0] as {
      where: unknown;
      data: { deletedAt: Date };
    };
    expect(call.where).toEqual({ id: "topic-1", deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("allaqachon o'chirilgan bo'lsa 'topilmadi'", async () => {
    mocks.topicCount.mockResolvedValue(0);
    mocks.topicUpdateMany.mockResolvedValue({ count: 0 });
    const { deleteTopic } = await import("@/server/admin-actions");

    expect(await deleteTopic({ id: "topic-1" })).toEqual({ ok: false, error: "topilmadi" });
  });

  it("Zod rad etadi: id yo'q", async () => {
    const { deleteTopic } = await import("@/server/admin-actions");

    expect(await deleteTopic({})).toEqual({ ok: false, error: "invalid" });
    expect(mocks.topicCount).not.toHaveBeenCalled();
  });
});
