import { beforeEach, describe, expect, it, vi } from "vitest";

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
  progressDelete: vi.fn(),
  slotFindMany: vi.fn(),
  yearFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOnboarded: mocks.requireOnboarded }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    teachingClass: { findFirst: mocks.classFindFirst },
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

describe("shiftClassPosition — orqaga", () => {
  const BACKWARD = { teachingClassId: "class-a", direction: "backward" };

  it("oxirgi DONE qator PLANNED ga qaytariladi va taughtOn null bo'ladi", async () => {
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-3", topicId: "t3" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition(BACKWARD);

    expect(result).toEqual({ ok: true, currentTopicId: "t3" });
    expect(mocks.progressUpdate).toHaveBeenCalledWith({
      where: { id: "progress-3" },
      data: { status: "PLANNED", taughtOn: null },
    });
  });

  it("qator O'CHIRILMAYDI — update, delete EMAS", async () => {
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-3", topicId: "t3" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(BACKWARD);

    expect(mocks.progressDelete).not.toHaveBeenCalled();
  });

  it("CHEGARA: DONE qator yo'q (birinchi mavzu) — 'chegara', yozuv yo'q", async () => {
    mocks.progressFindFirst.mockResolvedValue(null);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition(BACKWARD);

    expect(result).toEqual({ ok: false, error: "chegara" });
    expect(mocks.progressUpdate).not.toHaveBeenCalled();
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
  });

  it("chegarada revalidatePath chaqirilmaydi", async () => {
    mocks.progressFindFirst.mockResolvedValue(null);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(BACKWARD);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hisob UMUMAN yuritilmaydi (mavzular ham so'ralmaydi)", async () => {
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-3", topicId: "t3" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(BACKWARD);

    expect(mocks.topicFindMany).not.toHaveBeenCalled();
    expect(mocks.yearFindMany).not.toHaveBeenCalled();
  });

  it("eng oxirgi DONE taughtOn bo'yicha olinadi", async () => {
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-3", topicId: "t3" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(BACKWARD);

    const args = mocks.progressFindFirst.mock.calls[0]?.[0];
    expect(args.where).toEqual({ teachingClassId: "class-a", status: "DONE" });
    expect(args.orderBy).toEqual([{ taughtOn: "desc" }, { createdAt: "desc" }]);
  });
});

describe("shiftClassPosition — oldinga", () => {
  it("reja boshlanmagan — birinchi mavzu DONE deb belgilanadi", async () => {
    // Hech qanday DONE yo'q va bugun o'quv yilidan oldin emas, lekin
    // `currentTopicId` null bo'lgan holat: mavzular ro'yxati boshida.
    mocks.progressFindFirst.mockResolvedValue(null);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition(SHIFT);

    expect(result.ok).toBe(true);
    expect(mocks.progressUpsert).toHaveBeenCalledTimes(1);
    const args = mocks.progressUpsert.mock.calls[0]?.[0];
    expect(args.create.status).toBe("DONE");
  });

  it("taughtOn UTC yarim kecha", async () => {
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    const taughtOn = mocks.progressUpsert.mock.calls[0]?.[0].create.taughtOn as Date;
    expect(taughtOn.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it("CHEGARA: oxirgi mavzu allaqachon DONE — 'chegara', upsert yo'q", async () => {
    // Birinchi `findFirst` — oxirgi mavzu tekshiruvi, u qator qaytaradi.
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-5" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition(SHIFT);

    expect(result).toEqual({ ok: false, error: "chegara" });
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("chegara tekshiruvi oxirgi mavzu bo'yicha so'raladi", async () => {
    mocks.progressFindFirst.mockResolvedValue({ id: "progress-5" });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    expect(mocks.progressFindFirst.mock.calls[0]?.[0].where).toEqual({
      teachingClassId: "class-a",
      topicId: "t5",
      status: "DONE",
    });
  });

  it("mavzusi yo'q sinf — 'topilmadi'", async () => {
    mocks.topicFindMany.mockResolvedValue([]);
    const { shiftClassPosition } = await import("@/server/progress-actions");

    const result = await shiftClassPosition(SHIFT);

    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.progressUpsert).not.toHaveBeenCalled();
  });

  it("sinf orqada bo'lsa joriy mavzu DONE deb belgilanadi", async () => {
    // Action ichida `schoolDay(new Date())` — soat MUZLATILADI, aks holda test
    // o'quv yilidan chiqib ketganda (yozda) jimgina boshqa natija berardi.
    vi.useFakeTimers();
    vi.setSystemTime(d("2026-09-24"));
    try {
      // 40 mavzu: 2 soat/hafta bilan yil bo'yiga yetadi, ya'ni joriy mavzu
      // ro'yxat o'rtasida bo'ladi va surish ko'rinadi.
      const many = Array.from({ length: 40 }, (_unused, index) => ({
        id: `t${index + 1}`,
        parentId: null,
        order: index + 1,
        slug: `t${index + 1}`,
        quarter: null,
        hoursPlan: 1,
      }));
      mocks.topicFindMany.mockResolvedValue(many);

      // Oxirgi mavzu tekshiruvi — bo'sh; anchor so'rovi — t1 ni 2026-09-15 da
      // tugatgan sinf, ya'ni rejadan ORQADA.
      mocks.progressFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ topicId: "t1", taughtOn: d("2026-09-15") });
      const { shiftClassPosition } = await import("@/server/progress-actions");

      const behind = await shiftClassPosition(SHIFT);
      const behindTopic = mocks.progressUpsert.mock.calls[0]?.[0].create.topicId as string;

      // Endi anchor'siz (reja bo'yicha ketayotgan sinf).
      mocks.progressUpsert.mockClear();
      mocks.progressFindFirst.mockReset();
      mocks.progressFindFirst.mockResolvedValue(null);
      const onTime = await shiftClassPosition(SHIFT);
      const onTimeTopic = mocks.progressUpsert.mock.calls[0]?.[0].create.topicId as string;

      expect(behind.ok).toBe(true);
      expect(onTime.ok).toBe(true);
      // Orqada turgan sinf ro'yxatda OLDINROQ mavzuni belgilaydi.
      const indexOf = (id: string) => many.findIndex((topic) => topic.id === id);
      expect(indexOf(behindTopic)).toBeLessThan(indexOf(onTimeTopic));
    } finally {
      vi.useRealTimers();
    }
  });

  it("anchor eng katta taughtOn bo'yicha olinadi", async () => {
    mocks.progressFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ topicId: "t1", taughtOn: d("2026-09-15") });
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    const anchorCall = mocks.progressFindFirst.mock.calls[1]?.[0];
    expect(anchorCall.where).toEqual({
      teachingClassId: "class-a",
      status: "DONE",
      taughtOn: { not: null },
    });
    expect(anchorCall.orderBy).toEqual([{ taughtOn: "desc" }, { createdAt: "desc" }]);
  });

  it("jadval ScheduleSlot'dan o'qiladi (deletedAt: null)", async () => {
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    expect(mocks.slotFindMany.mock.calls[0]?.[0].where).toEqual({
      teachingClassId: "class-a",
      deletedAt: null,
    });
  });

  it("viloyat ta'tillari so'rovda filtrlanadi", async () => {
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    const holidayWhere = mocks.yearFindMany.mock.calls[0]?.[0].select.holidays.where;
    expect(holidayWhere.deletedAt).toBeNull();
    expect(holidayWhere.OR).toEqual([
      { scope: "GLOBAL" },
      { scope: "REGION", region: "andijon" },
    ]);
  });

  it("muvaffaqiyatda revalidate qilinadi", async () => {
    const { shiftClassPosition } = await import("@/server/progress-actions");

    await shiftClassPosition(SHIFT);

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/rejam",
    ]);
  });
});
