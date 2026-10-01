import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/progress-actions.ts (docs/sessions/09-dars-jadvali.md, 6-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 *
 * `lib/calendar/*` ATAYLAB MOCK QILINMAYDI — u sof va tez. Mock qilinsa
 * chegara testlari bo'shab qolardi: "oxirgi mavzudan oldinga surilmaydi"
 * degan shart aynan haqiqiy hisobga tayanadi.
 *
 * Spek 8-bandi MAJBURIY qilgan ikki chegara:
 * - birinchi mavzudan ORQAGA surilmaydi;
 * - oxirgisidan OLDINGA surilmaydi.
 */

const SESSION_USER = {
  id: "user-1",
  fullName: "Test",
  username: null,
  role: "TEACHER",
  region: "andijon",
  subjects: ["fizika"],
  grades: [7],
  locale: "uz",
  creditBalance: 0,
  creditsHeld: 0,
  sessionVersion: 5,
};

const KLASS = {
  id: "class-a",
  subjectId: "subject-fizika",
  grade: 7,
  lessonsPerWeek: 2,
  academicYearId: "year-1",
  topicOffset: 0,
};

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const YEAR = {
  quarters: [
    { number: 1, startsOn: d("2026-09-01"), endsOn: d("2026-10-30") },
    { number: 2, startsOn: d("2026-11-09"), endsOn: d("2026-12-25") },
  ],
  holidays: [],
};

/** Yassi mavzu ro'yxati (ota-bola yo'q, ya'ni `flattenTopicTree` hammasini beradi). */
const TOPICS = Array.from({ length: 5 }, (_unused, index) => ({
  id: `t${index + 1}`,
  parentId: null,
  order: index + 1,
  slug: `t${index + 1}`,
  quarter: null,
  hoursPlan: 1,
}));

const MARK = { teachingClassId: "class-a", topicId: "t1" };
const SHIFT = { teachingClassId: "class-a", direction: "forward" };

const mocks = vi.hoisted(() => ({
  requireOnboarded: vi.fn(),
  revalidatePath: vi.fn(),
  classFindFirst: vi.fn(),
  topicFindFirst: vi.fn(),
  topicFindMany: vi.fn(),
  progressUpsert: vi.fn(),
  progressFindFirst: vi.fn(),
  progressUpdate: vi.fn(),
  classUpdate: vi.fn(),
  progressDelete: vi.fn(),
  slotFindMany: vi.fn(),
  yearFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOnboarded: mocks.requireOnboarded }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    teachingClass: { findFirst: mocks.classFindFirst, update: mocks.classUpdate },
    topic: { findFirst: mocks.topicFindFirst, findMany: mocks.topicFindMany },
    topicProgress: {
      upsert: mocks.progressUpsert,
      findFirst: mocks.progressFindFirst,
      update: mocks.progressUpdate,
      delete: mocks.progressDelete,
    },
    scheduleSlot: { findMany: mocks.slotFindMany },
    academicYear: { findMany: mocks.yearFindMany },
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
  mocks.classFindFirst.mockResolvedValue({ ...KLASS });
  mocks.topicFindFirst.mockResolvedValue({ id: "t1" });
  mocks.topicFindMany.mockResolvedValue(TOPICS);
  mocks.progressUpsert.mockResolvedValue({ id: "progress-1" });
  mocks.progressUpdate.mockResolvedValue({ id: "progress-1" });
  mocks.classUpdate.mockResolvedValue({ id: "class-a" });
  mocks.slotFindMany.mockResolvedValue([{ weekday: 2 }, { weekday: 4 }]);
  mocks.yearFindMany.mockResolvedValue([YEAR]);
  // Sukut bo'yicha hech qanday `DONE` qator yo'q (reja boshlanmagan).
  mocks.progressFindFirst.mockResolvedValue(null);
});

describe("auth har action'da birinchi", () => {
  it("axlat input'da ham avval requireOnboarded chaqiriladi", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    const result = await markTopicTaught({ topicId: "" });

    expect(calls).toEqual(["requireOnboarded"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.classFindFirst).not.toHaveBeenCalled();
  });

  it("auth yiqilsa hech narsa yozilmaydi", async () => {
    mocks.requireOnboarded.mockRejectedValue(new Error("REDIRECT"));
    const { markTopicTaught, shiftClassPosition } = await import("@/server/progress-actions");

    await expect(markTopicTaught(MARK)).rejects.toThrow("REDIRECT");
    await expect(shiftClassPosition(SHIFT)).rejects.toThrow("REDIRECT");

    expect(mocks.progressUpsert).not.toHaveBeenCalled();
    expect(mocks.progressUpdate).not.toHaveBeenCalled();
  });
});

describe("markTopicTaught", () => {
  it("begona sinf rad etiladi", async () => {
    mocks.classFindFirst.mockResolvedValue(null);
    const { markTopicTaught } = await import("@/server/progress-actions");

    const result = await markTopicTaught(MARK);

    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.classFindFirst.mock.calls[0]?.[0].where.userId).toBe("user-1");
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
  });

  it("o'chirilgan sinf rad etiladi", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    await markTopicTaught(MARK);

    expect(mocks.classFindFirst.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });

  it("sinfning fani/sinf raqamiga tegishli bo'lmagan mavzu rad etiladi", async () => {
    mocks.topicFindFirst.mockResolvedValue(null);
    const { markTopicTaught } = await import("@/server/progress-actions");

    const result = await markTopicTaught(MARK);

    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.topicFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: "t1",
      subjectId: "subject-fizika",
      grade: 7,
      deletedAt: null,
    });
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
  });

  it("DONE va taughtOn bilan upsert qiladi", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    const result = await markTopicTaught(MARK);

    expect(result).toEqual({ ok: true });
    const args = mocks.progressUpsert.mock.calls[0]?.[0];
    expect(args.where.teachingClassId_topicId).toEqual({
      teachingClassId: "class-a",
      topicId: "t1",
    });
    expect(args.create.status).toBe("DONE");
    expect(args.update.status).toBe("DONE");
  });

  it("taughtOn UTC yarim kecha bo'lib yoziladi", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    await markTopicTaught(MARK);

    const taughtOn = mocks.progressUpsert.mock.calls[0]?.[0].create.taughtOn as Date;
    expect(taughtOn.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it("berilgan taughtOn ishlatiladi (YYYY-MM-DD -> UTC yarim kecha)", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    await markTopicTaught({ ...MARK, taughtOn: "2026-09-15" });

    const taughtOn = mocks.progressUpsert.mock.calls[0]?.[0].create.taughtOn as Date;
    expect(taughtOn.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it.each([
    ["topicId yo'q", { teachingClassId: "class-a" }],
    ["teachingClassId yo'q", { topicId: "t1" }],
    ["taughtOn 01.09.2026", { ...MARK, taughtOn: "01.09.2026" }],
    ["taughtOn 2027-02-31 (mavjud emas)", { ...MARK, taughtOn: "2027-02-31" }],
    ["taughtOn 2026-13-01", { ...MARK, taughtOn: "2026-13-01" }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    expect(await markTopicTaught(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
  });

  it("xatoda revalidatePath chaqirilmaydi", async () => {
    mocks.classFindFirst.mockResolvedValue(null);
    const { markTopicTaught } = await import("@/server/progress-actions");

    await markTopicTaught(MARK);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("muvaffaqiyatda [locale] yo'llari revalidate qilinadi", async () => {
    const { markTopicTaught } = await import("@/server/progress-actions");

    await markTopicTaught(MARK);

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/rejam",
    ]);
  });
});

describe("shiftClassPosition — egalik va Zod", () => {
  it("begona sinf rad etiladi", async () => {
    mocks.classFindFirst.mockResolvedValue(null);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    expect(await shiftClassPosition(SHIFT)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
    expect(mocks.progressUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["direction 'up'", { teachingClassId: "class-a", direction: "up" }],
    ["direction yo'q", { teachingClassId: "class-a" }],
    ["teachingClassId yo'q", { direction: "forward" }],
    ["direction raqam", { teachingClassId: "class-a", direction: 1 }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { shiftClassPosition } = await import("@/server/progress-actions");

    expect(await shiftClassPosition(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.classFindFirst).not.toHaveBeenCalled();
  });
});


/**
 * Surish testlari — soat MUZLATILADI.
 *
 * `shiftClassPosition` ichida `schoolDay(new Date())` bor va `lib/calendar/*`
 * mock QILINMAGAN (sof va tez). Muzlatilmasa test o'quv yilidan chiqib
 * ketganda jimgina boshqa natija berardi.
 *
 * 2026-09-08 — seshanba. Jadval [2, 4], haftada 2 soat, 5 ta mavzu:
 * t1 (01-sen), t2 (03-sen), t3 (08-sen), t4 (10-sen), t5 (15-sen).
 * Ya'ni shu kuni reja bo'yicha joriy mavzu — t3, ikki tomonda ham joy bor.
 */
describe("shiftClassPosition — ko'rsatkichni suradi", () => {
  const FROZEN = d("2026-09-08");

  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("› topicOffset ni +1 qiladi va keyingi mavzuni qaytaradi", async () => {
    freeze();
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(result).toEqual({ ok: true, currentTopicId: "t4" });
    expect(mocks.classUpdate).toHaveBeenCalledWith({
      where: { id: "class-a" },
      data: { topicOffset: 1 },
    });
  });

  it("‹ topicOffset ni -1 qiladi va oldingi mavzuni qaytaradi", async () => {
    freeze();
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "backward" });

    expect(result).toEqual({ ok: true, currentTopicId: "t2" });
    expect(mocks.classUpdate).toHaveBeenCalledWith({
      where: { id: "class-a" },
      data: { topicOffset: -1 },
    });
  });

  it("mavjud offsetdan hisoblanadi (0 dan emas)", async () => {
    freeze();
    mocks.classFindFirst.mockResolvedValue({ ...KLASS, topicOffset: 1 });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(mocks.classUpdate.mock.calls[0]?.[0].data.topicOffset).toBe(2);
  });

  it("TopicProgress ga TEGMAYDI — u tarix, bu ko'rsatkich", async () => {
    freeze();
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(mocks.progressUpsert).not.toHaveBeenCalled();
    expect(mocks.progressUpdate).not.toHaveBeenCalled();
    expect(mocks.progressDelete).not.toHaveBeenCalled();
  });

  it("muvaffaqiyatda revalidate qilinadi", async () => {
    freeze();
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/rejam",
    ]);
  });
});

describe("shiftClassPosition — chegaralar", () => {
  const FROZEN = d("2026-09-08");

  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("CHEGARA: birinchi mavzudan orqaga surilmaydi", async () => {
    freeze();
    // offset -2 => joriy mavzu t1, ya'ni ro'yxat boshi.
    mocks.classFindFirst.mockResolvedValue({ ...KLASS, topicOffset: -2 });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "backward" });

    expect(result).toEqual({ ok: false, error: "chegara" });
    expect(mocks.classUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("CHEGARA: oxirgi mavzudan oldinga surilmaydi", async () => {
    freeze();
    // offset +2 => joriy mavzu t5, ya'ni ro'yxat oxiri.
    mocks.classFindFirst.mockResolvedValue({ ...KLASS, topicOffset: 2 });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(result).toEqual({ ok: false, error: "chegara" });
    expect(mocks.classUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("chegaradagi sinf TESKARI yo'nalishda SURILADI", async () => {
    freeze();
    mocks.classFindFirst.mockResolvedValue({ ...KLASS, topicOffset: 2 });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "backward" });

    expect(result).toEqual({ ok: true, currentTopicId: "t4" });
    expect(mocks.classUpdate.mock.calls[0]?.[0].data.topicOffset).toBe(1);
  });

  it("juda katta offset ham ro'yxatdan chiqarmaydi", async () => {
    freeze();
    mocks.classFindFirst.mockResolvedValue({ ...KLASS, topicOffset: 999 });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    expect(
      await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" }),
    ).toEqual({ ok: false, error: "chegara" });
  });

  it("mavzusi yo'q sinf — 'topilmadi'", async () => {
    freeze();
    mocks.topicFindMany.mockResolvedValue([]);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.classUpdate).not.toHaveBeenCalled();
  });
});

describe("shiftClassPosition — sinflar bir-biriga ta'sir qilmaydi", () => {
  it("7-A ni surish FAQAT 7-A qatorini yangilaydi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(d("2026-09-08"));
    try {
      const { shiftClassPosition } = await import("@/server/progress-actions");

      await shiftClassPosition({ teachingClassId: "class-a", direction: "forward" });

      // `where` faqat shu sinfni ko'rsatadi — `updateMany` yoki keng filtr yo'q.
      expect(mocks.classUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.classUpdate.mock.calls[0]?.[0].where).toEqual({ id: "class-a" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("7-B o'z offseti bilan mustaqil hisoblanadi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(d("2026-09-08"));
    try {
      mocks.classFindFirst.mockResolvedValue({ ...KLASS, id: "class-b", topicOffset: -1 });
      const { shiftClassPosition } = await import("@/server/progress-actions");

      const result = await shiftClassPosition({
        teachingClassId: "class-b",
        direction: "forward",
      });

      // 7-B offseti -1 edi (joriy t2), surilgandan keyin 0 va joriy t3.
      expect(result).toEqual({ ok: true, currentTopicId: "t3" });
      expect(mocks.classUpdate.mock.calls[0]?.[0].data.topicOffset).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
