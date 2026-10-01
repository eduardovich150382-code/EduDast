import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/class-actions.ts (docs/sessions/09-dars-jadvali.md, 2-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 *
 * `tests/calendar-actions.test.ts` naqshi: `vi.hoisted` mock to'plami, qo'lda
 * yasalgan qisman Prisma stub'i, va `calls` massivi — u auth BIRINCHI await
 * ekanini isbotlaydi (layout server action POST'ini himoya qilmaydi).
 */

const SESSION_USER = {
  id: "user-1",
  fullName: "Test",
  username: null,
  role: "TEACHER",
  region: "andijon",
  subjects: ["fizika", "kimyo"],
  grades: [7, 8],
  locale: "uz",
  creditBalance: 0,
  creditsHeld: 0,
  sessionVersion: 5,
};

/** To'g'ri payload — har test uni kerakli joyida buzadi. */
const CLASS = { subjectSlug: "fizika", grade: 7, label: "A", lessonsPerWeek: 2 };

class PrismaError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const mocks = vi.hoisted(() => ({
  requireOnboarded: vi.fn(),
  revalidatePath: vi.fn(),
  subjectFindUnique: vi.fn(),
  yearFindMany: vi.fn(),
  classUpsert: vi.fn(),
  classUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOnboarded: mocks.requireOnboarded }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    subject: { findUnique: mocks.subjectFindUnique },
    academicYear: { findMany: mocks.yearFindMany },
    teachingClass: { upsert: mocks.classUpsert, updateMany: mocks.classUpdateMany },
  },
}));

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireOnboarded.mockImplementation(async () => {
    calls.push("requireOnboarded");
    return { ...SESSION_USER };
  });
  mocks.subjectFindUnique.mockResolvedValue({ id: "subject-fizika" });
  mocks.yearFindMany.mockResolvedValue([{ id: "year-1" }]);
  mocks.classUpsert.mockResolvedValue({ id: "class-1" });
  mocks.classUpdateMany.mockResolvedValue({ count: 1 });
});

describe("auth har action'da birinchi", () => {
  it("axlat input'da ham avval requireOnboarded chaqiriladi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass({ subjectSlug: "" });

    expect(calls).toEqual(["requireOnboarded"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.subjectFindUnique).not.toHaveBeenCalled();
    expect(mocks.classUpsert).not.toHaveBeenCalled();
  });

  it("auth yiqilsa hech narsa yozilmaydi", async () => {
    mocks.requireOnboarded.mockRejectedValue(new Error("REDIRECT"));
    const { saveTeachingClass, deleteTeachingClass } = await import("@/server/class-actions");

    await expect(saveTeachingClass(CLASS)).rejects.toThrow("REDIRECT");
    await expect(deleteTeachingClass({ id: "class-1" })).rejects.toThrow("REDIRECT");

    expect(mocks.classUpsert).not.toHaveBeenCalled();
    expect(mocks.classUpdateMany).not.toHaveBeenCalled();
  });
});

describe("saveTeachingClass", () => {
  it.each([
    ["sinf 0", { ...CLASS, grade: 0 }],
    ["sinf 12", { ...CLASS, grade: 12 }],
    ["sinf satr", { ...CLASS, grade: "7" }],
    ["lessonsPerWeek 0", { ...CLASS, lessonsPerWeek: 0 }],
    ["lessonsPerWeek 99", { ...CLASS, lessonsPerWeek: 99 }],
    ["lessonsPerWeek kasr", { ...CLASS, lessonsPerWeek: 1.5 }],
    ["noma'lum harf", { ...CLASS, label: "J" }],
    ["kirill harfi", { ...CLASS, label: "А" }],
    ["subjectSlug yo'q", { grade: 7, label: "A", lessonsPerWeek: 2 }],
    ["butunlay boshqa shakl", "fizika"],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    expect(await saveTeachingClass(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.classUpsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("bo'sh harf ('' — harfsiz sinf) qabul qilinadi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    expect(await saveTeachingClass({ ...CLASS, label: "" })).toEqual({ ok: true, id: "class-1" });
  });

  it("o'qituvchi tanlamagan fan rad etiladi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass({ ...CLASS, subjectSlug: "biologiya" });

    expect(result).toEqual({ ok: false, error: "ruxsat" });
    // Fan bazada bor-yo'qligi ham so'ralmaydi — ruxsat tekshiruvi oldinda.
    expect(mocks.subjectFindUnique).not.toHaveBeenCalled();
  });

  it("o'qituvchi tanlamagan sinf raqami rad etiladi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass({ ...CLASS, grade: 9 });

    expect(result).toEqual({ ok: false, error: "ruxsat" });
    expect(mocks.subjectFindUnique).not.toHaveBeenCalled();
  });

  it("bazada yo'q fan slug'i — 'topilmadi'", async () => {
    mocks.subjectFindUnique.mockResolvedValue(null);
    const { saveTeachingClass } = await import("@/server/class-actions");

    expect(await saveTeachingClass(CLASS)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.classUpsert).not.toHaveBeenCalled();
  });

  it("faol o'quv yili bo'lmasa 'topilmadi'", async () => {
    mocks.yearFindMany.mockResolvedValue([]);
    const { saveTeachingClass } = await import("@/server/class-actions");

    expect(await saveTeachingClass(CLASS)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.classUpsert).not.toHaveBeenCalled();
  });

  it("faol yil take: 1 bilan olinadi (ikki faol yil tasodifiy tanlanmasin)", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    await saveTeachingClass(CLASS);

    expect(mocks.yearFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { startsOn: "desc" },
      take: 1,
      select: { id: true },
    });
  });

  it("academicYearId KIRISHDAN OLINMAYDI — faol yil ishlatiladi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    await saveTeachingClass({ ...CLASS, academicYearId: "begona-yil" });

    const payload = mocks.classUpsert.mock.calls[0]?.[0];
    expect(payload.create.academicYearId).toBe("year-1");
    expect(payload.where.userId_subjectId_grade_label_academicYearId.academicYearId).toBe("year-1");
  });

  it("yangi sinf upsert bilan yoziladi va o'chirilganini tiriltiradi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass(CLASS);

    expect(result).toEqual({ ok: true, id: "class-1" });
    const payload = mocks.classUpsert.mock.calls[0]?.[0];
    expect(payload.create).toEqual({
      userId: "user-1",
      subjectId: "subject-fizika",
      grade: 7,
      label: "A",
      lessonsPerWeek: 2,
      academicYearId: "year-1",
    });
    // O'chirilgan sinfni tiriltirish — `@@unique` o'chirilgan qatorni qamraydi.
    expect(payload.update).toEqual({ lessonsPerWeek: 2, deletedAt: null });
  });

  it("boshqa o'qituvchining sinfini tahrirlab bo'lmaydi", async () => {
    mocks.classUpdateMany.mockResolvedValue({ count: 0 });
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass({ ...CLASS, id: "begona-sinf" });

    // "ruxsat" EMAS: farqli javob begona id'ni tekshirib ko'rish imkonini berardi.
    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.classUpdateMany.mock.calls[0]?.[0].where.userId).toBe("user-1");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("o'chirilgan sinf tahrirlanmaydi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    await saveTeachingClass({ ...CLASS, id: "class-1" });

    expect(mocks.classUpdateMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });

  it("tahrirda upsert ishlatilmaydi (id bor — updateMany)", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    const result = await saveTeachingClass({ ...CLASS, id: "class-1", lessonsPerWeek: 3 });

    expect(result).toEqual({ ok: true, id: "class-1" });
    expect(mocks.classUpsert).not.toHaveBeenCalled();
    expect(mocks.classUpdateMany.mock.calls[0]?.[0].data.lessonsPerWeek).toBe(3);
  });

  it("takrorlangan sinfga aylantirish — 'band'", async () => {
    mocks.classUpdateMany.mockRejectedValue(new PrismaError("P2002"));
    const { saveTeachingClass } = await import("@/server/class-actions");

    expect(await saveTeachingClass({ ...CLASS, id: "class-1" })).toEqual({
      ok: false,
      error: "band",
    });
  });

  it("kutilmagan xato yashirilmaydi", async () => {
    mocks.classUpsert.mockRejectedValue(new Error("tarmoq uzildi"));
    const { saveTeachingClass } = await import("@/server/class-actions");

    await expect(saveTeachingClass(CLASS)).rejects.toThrow("tarmoq uzildi");
  });

  it("muvaffaqiyatda [locale] yo'llari revalidate qilinadi", async () => {
    const { saveTeachingClass } = await import("@/server/class-actions");

    await saveTeachingClass(CLASS);

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/sinflarim",
      "/[locale]/ish/jadval",
    ]);
    expect(mocks.revalidatePath.mock.calls.every((call) => call[1] === "page")).toBe(true);
  });
});

describe("deleteTeachingClass", () => {
  it("soft delete qiladi (hard delete YO'Q)", async () => {
    const { deleteTeachingClass } = await import("@/server/class-actions");

    const result = await deleteTeachingClass({ id: "class-1" });

    expect(result).toEqual({ ok: true });
    const payload = mocks.classUpdateMany.mock.calls[0]?.[0];
    expect(payload.where).toEqual({ id: "class-1", userId: "user-1", deletedAt: null });
    expect(payload.data.deletedAt).toBeInstanceOf(Date);
  });

  it("begona sinf — 'topilmadi'", async () => {
    mocks.classUpdateMany.mockResolvedValue({ count: 0 });
    const { deleteTeachingClass } = await import("@/server/class-actions");

    expect(await deleteTeachingClass({ id: "begona" })).toEqual({
      ok: false,
      error: "topilmadi",
    });
  });

  it("allaqachon o'chirilgan — 'topilmadi', revalidate yo'q", async () => {
    mocks.classUpdateMany.mockResolvedValue({ count: 0 });
    const { deleteTeachingClass } = await import("@/server/class-actions");

    await deleteTeachingClass({ id: "class-1" });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("jadval va progress TEGILMAYDI", async () => {
    const { deleteTeachingClass } = await import("@/server/class-actions");

    await deleteTeachingClass({ id: "class-1" });

    // Faqat bitta yozuv amali — sinfning o'zi.
    expect(mocks.classUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.classUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["id yo'q", {}],
    ["id bo'sh", { id: "" }],
    ["id raqam", { id: 7 }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { deleteTeachingClass } = await import("@/server/class-actions");

    expect(await deleteTeachingClass(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.classUpdateMany).not.toHaveBeenCalled();
  });
});
