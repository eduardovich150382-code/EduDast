import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/calendar-actions.ts (CLAUDE.md 8-qoida: har server action = yangi test).
 *
 * Eng muhim tekshiruv: HAR BIR action o'zi `requireAdmin()` chaqiradi.
 * `app/[locale]/admin/layout.tsx` dagi qorovul action POST'ini to'smaydi,
 * shuning uchun bu jadval buzilsa kalendar hammaga ochiq qolgan bo'lardi.
 *
 * Ikkinchi muhim tekshiruv: sanalar UTC yarim kecha bo'lib yoziladi —
 * `lib/calendar/placement.ts` shartnomasi. Buzilsa butun reja bir kunga
 * siljiydi va hech qayerda xato chiqmaydi.
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
  yearCreate: vi.fn(),
  yearUpdate: vi.fn(),
  yearUpdateMany: vi.fn(),
  yearFindUnique: vi.fn(),
  quarterUpsert: vi.fn(),
  holidayCreate: vi.fn(),
  holidayUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    academicYear: {
      create: mocks.yearCreate,
      update: mocks.yearUpdate,
      updateMany: mocks.yearUpdateMany,
      findUnique: mocks.yearFindUnique,
    },
    quarter: { upsert: mocks.quarterUpsert },
    holiday: { create: mocks.holidayCreate, updateMany: mocks.holidayUpdateMany },
    $transaction: mocks.transaction,
  },
}));

const YEAR = {
  label: "2026–2027",
  startsOn: "2026-09-01",
  endsOn: "2027-05-25",
  isActive: true,
};

const QUARTERS = {
  academicYearId: "year-1",
  quarters: [
    { number: 1, startsOn: "2026-09-01", endsOn: "2026-10-30" },
    { number: 2, startsOn: "2026-11-09", endsOn: "2026-12-25" },
  ],
};

const HOLIDAY = {
  academicYearId: "year-1",
  label: "Mustaqillik kuni",
  startsOn: "2026-09-01",
  endsOn: "2026-09-01",
  scope: "GLOBAL" as const,
  region: null,
};

/** Bazadan o'qiladigan o'quv yili chegarasi. */
const YEAR_ROW = { startsOn: new Date("2026-09-01T00:00:00.000Z"), endsOn: new Date("2027-05-25T00:00:00.000Z") };

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAdmin.mockImplementation(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", role: "ADMIN" };
  });
  // `$transaction` ikki shaklda ishlatiladi: callback (yil) va massiv (choraklar).
  mocks.transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => Promise<unknown>)({
          academicYear: {
            create: mocks.yearCreate,
            update: mocks.yearUpdate,
            updateMany: mocks.yearUpdateMany,
          },
        })
      : Promise.all(arg as Promise<unknown>[]),
  );
  mocks.yearCreate.mockResolvedValue({ id: "year-1" });
  mocks.yearUpdate.mockResolvedValue({ id: "year-1" });
  mocks.yearUpdateMany.mockResolvedValue({ count: 0 });
  mocks.yearFindUnique.mockResolvedValue(YEAR_ROW);
  mocks.quarterUpsert.mockResolvedValue({ id: "q-1" });
  mocks.holidayCreate.mockResolvedValue({ id: "h-1" });
  mocks.holidayUpdateMany.mockResolvedValue({ count: 1 });
});

function denyAdmin() {
  mocks.requireAdmin.mockImplementation(async () => {
    throw new NotFoundSentinel();
  });
}

describe("requireAdmin har action'da chaqiriladi", () => {
  it.each([
    ["saveAcademicYear", YEAR],
    ["saveQuarters", QUARTERS],
    ["saveHoliday", HOLIDAY],
    ["deleteHoliday", { id: "h-1" }],
  ])("%s — ADMIN bo'lmasa hech narsa yozilmaydi", async (name, payload) => {
    denyAdmin();
    const actions = (await import("@/server/calendar-actions")) as Record<
      string,
      (input: unknown) => Promise<unknown>
    >;

    await expect(actions[name]!(payload)).rejects.toThrow(NotFoundSentinel);

    expect(mocks.yearCreate).not.toHaveBeenCalled();
    expect(mocks.quarterUpsert).not.toHaveBeenCalled();
    expect(mocks.holidayCreate).not.toHaveBeenCalled();
    expect(mocks.holidayUpdateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("axlat input'da ham avval requireAdmin chaqiriladi", async () => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    const result = await saveQuarters({ nonsense: true });

    expect(calls).toEqual(["requireAdmin"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.yearFindUnique).not.toHaveBeenCalled();
  });
});

describe("saveAcademicYear", () => {
  it.each([
    ["label qisqa", { ...YEAR, label: "26" }],
    ["sana shakli buzuq", { ...YEAR, startsOn: "01.09.2026" }],
    ["mavjud bo'lmagan sana", { ...YEAR, endsOn: "2027-02-31" }],
    ["isActive satr", { ...YEAR, isActive: "ha" }],
  ])("Zod rad etadi: %s", async (_nom, payload) => {
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    expect(await saveAcademicYear(payload)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.yearCreate).not.toHaveBeenCalled();
  });

  it("boshlanish tugashdan keyin bo'lsa rad etiladi", async () => {
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    expect(
      await saveAcademicYear({ ...YEAR, startsOn: "2027-05-25", endsOn: "2026-09-01" }),
    ).toEqual({ ok: false, error: "sana" });
  });

  /** Bu test buzilsa butun reja bir kunga siljiydi va hech kim sezmaydi. */
  it("sanalar UTC yarim kecha bo'lib yoziladi", async () => {
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    await saveAcademicYear(YEAR);

    const data = mocks.yearCreate.mock.calls[0]?.[0]?.data as { startsOn: Date; endsOn: Date };
    expect(data.startsOn.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(data.endsOn.toISOString()).toBe("2027-05-25T00:00:00.000Z");
  });

  it("faol yil belgilanganda qolganlari o'chiriladi", async () => {
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    expect(await saveAcademicYear(YEAR)).toEqual({ ok: true, id: "year-1" });
    expect(mocks.yearUpdateMany).toHaveBeenCalledWith({
      where: { id: { not: "year-1" }, isActive: true },
      data: { isActive: false },
    });
  });

  it("isActive false bo'lsa boshqa yillarga tegilmaydi", async () => {
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    await saveAcademicYear({ ...YEAR, isActive: false });

    expect(mocks.yearUpdateMany).not.toHaveBeenCalled();
  });

  it("takrorlangan label — 'band'", async () => {
    mocks.yearCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    expect(await saveAcademicYear(YEAR)).toEqual({ ok: false, error: "band" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("kutilmagan xato yashirilmaydi", async () => {
    mocks.yearCreate.mockRejectedValue(new Error("tarmoq uzildi"));
    const { saveAcademicYear } = await import("@/server/calendar-actions");

    await expect(saveAcademicYear(YEAR)).rejects.toThrow("tarmoq uzildi");
  });
});

describe("saveQuarters", () => {
  it("o'quv yili topilmasa 'topilmadi'", async () => {
    mocks.yearFindUnique.mockResolvedValue(null);
    const { saveQuarters } = await import("@/server/calendar-actions");

    expect(await saveQuarters(QUARTERS)).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.quarterUpsert).not.toHaveBeenCalled();
  });

  /** Kesishgan chorak `placement.ts` da bir kunni ikki chorakka tegishli qilardi. */
  it("kesishgan choraklar rad etiladi", async () => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    const result = await saveQuarters({
      academicYearId: "year-1",
      quarters: [
        { number: 1, startsOn: "2026-09-01", endsOn: "2026-11-15" },
        { number: 2, startsOn: "2026-11-09", endsOn: "2026-12-25" },
      ],
    });

    expect(result).toEqual({ ok: false, error: "sana" });
    expect(mocks.quarterUpsert).not.toHaveBeenCalled();
  });

  it("number tartibi sana tartibiga mos bo'lmasa rad etiladi", async () => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    const result = await saveQuarters({
      academicYearId: "year-1",
      quarters: [
        { number: 1, startsOn: "2026-11-09", endsOn: "2026-12-25" },
        { number: 2, startsOn: "2026-09-01", endsOn: "2026-10-30" },
      ],
    });

    expect(result).toEqual({ ok: false, error: "sana" });
  });

  it.each([
    ["takrorlangan number", [
      { number: 1, startsOn: "2026-09-01", endsOn: "2026-10-30" },
      { number: 1, startsOn: "2026-11-09", endsOn: "2026-12-25" },
    ]],
    ["teskari sana", [{ number: 1, startsOn: "2026-10-30", endsOn: "2026-09-01" }]],
  ])("rad etiladi: %s", async (_nom, quarters) => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    expect(await saveQuarters({ academicYearId: "year-1", quarters })).toEqual({
      ok: false,
      error: "sana",
    });
  });

  it("chorak o'quv yili chegarasidan tashqarida bo'lsa rad etiladi", async () => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    const result = await saveQuarters({
      academicYearId: "year-1",
      quarters: [{ number: 4, startsOn: "2027-05-01", endsOn: "2027-06-30" }],
    });

    expect(result).toEqual({ ok: false, error: "sana" });
  });

  /** CLAUDE.md: hech qachon `delete`. Almashtirish emas, `upsert`. */
  it("upsert bilan yozadi, o'chirish yo'q", async () => {
    const { saveQuarters } = await import("@/server/calendar-actions");

    expect(await saveQuarters(QUARTERS)).toEqual({ ok: true });
    expect(mocks.quarterUpsert).toHaveBeenCalledTimes(2);
    const first = mocks.quarterUpsert.mock.calls[0]?.[0] as { where: unknown };
    expect(first.where).toEqual({ academicYearId_number: { academicYearId: "year-1", number: 1 } });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });
});

describe("saveHoliday", () => {
  it("REGION viloyatsiz rad etiladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    expect(await saveHoliday({ ...HOLIDAY, scope: "REGION", region: null })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(mocks.holidayCreate).not.toHaveBeenCalled();
  });

  it("GLOBAL viloyat bilan rad etiladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    expect(await saveHoliday({ ...HOLIDAY, scope: "GLOBAL", region: "navoiy" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("ro'yxatda yo'q viloyat kodi rad etiladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    expect(await saveHoliday({ ...HOLIDAY, scope: "REGION", region: "toshkent" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("REGION to'g'ri viloyat bilan yoziladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    const result = await saveHoliday({ ...HOLIDAY, scope: "REGION", region: "navoiy" });

    expect(result).toEqual({ ok: true });
    const data = mocks.holidayCreate.mock.calls[0]?.[0]?.data as { scope: string; region: string };
    expect(data).toMatchObject({ scope: "REGION", region: "navoiy" });
  });

  it("ta'til o'quv yili chegarasidan tashqarida bo'lsa rad etiladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    const result = await saveHoliday({
      ...HOLIDAY,
      startsOn: "2027-07-01",
      endsOn: "2027-07-05",
    });

    expect(result).toEqual({ ok: false, error: "sana" });
    expect(mocks.holidayCreate).not.toHaveBeenCalled();
  });

  it("boshlanish tugashdan keyin bo'lsa rad etiladi", async () => {
    const { saveHoliday } = await import("@/server/calendar-actions");

    expect(
      await saveHoliday({ ...HOLIDAY, startsOn: "2026-09-10", endsOn: "2026-09-01" }),
    ).toEqual({ ok: false, error: "sana" });
  });

  it("o'chirilgan ta'til tahrirlanmaydi", async () => {
    mocks.holidayUpdateMany.mockResolvedValue({ count: 0 });
    const { saveHoliday } = await import("@/server/calendar-actions");

    expect(await saveHoliday({ ...HOLIDAY, id: "h-1" })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    const call = mocks.holidayUpdateMany.mock.calls[0]?.[0] as { where: unknown };
    expect(call.where).toEqual({ id: "h-1", deletedAt: null });
  });
});

describe("deleteHoliday", () => {
  it("soft delete qiladi (hard delete YO'Q)", async () => {
    const { deleteHoliday } = await import("@/server/calendar-actions");

    expect(await deleteHoliday({ id: "h-1" })).toEqual({ ok: true });
    const call = mocks.holidayUpdateMany.mock.calls[0]?.[0] as {
      where: unknown;
      data: { deletedAt: Date };
    };
    expect(call.where).toEqual({ id: "h-1", deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("allaqachon o'chirilgan bo'lsa 'topilmadi'", async () => {
    mocks.holidayUpdateMany.mockResolvedValue({ count: 0 });
    const { deleteHoliday } = await import("@/server/calendar-actions");

    expect(await deleteHoliday({ id: "h-1" })).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("Zod rad etadi: id yo'q", async () => {
    const { deleteHoliday } = await import("@/server/calendar-actions");

    expect(await deleteHoliday({})).toEqual({ ok: false, error: "invalid" });
    expect(mocks.holidayUpdateMany).not.toHaveBeenCalled();
  });
});
