import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/schedule-actions.ts (docs/sessions/09-dars-jadvali.md, 3-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 *
 * Asosiy ikki shart bu yerda qotirib qo'yiladi:
 * 1. ziddiyat bazaga BORMASDAN aniqlanadi (ya'ni `$transaction` ochilmaydi);
 * 2. saqlash ATOMAR — bitta `$transaction`, yarim jadval qolmaydi.
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

const SLOT_A = { teachingClassId: "class-a", weekday: 2, lessonNo: 3 };
const SLOT_B = { teachingClassId: "class-b", weekday: 4, lessonNo: 1 };

const mocks = vi.hoisted(() => ({
  requireOnboarded: vi.fn(),
  revalidatePath: vi.fn(),
  classFindMany: vi.fn(),
  slotUpdateMany: vi.fn(),
  slotUpsert: vi.fn(),
  slotDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOnboarded: mocks.requireOnboarded }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    teachingClass: { findMany: mocks.classFindMany },
    scheduleSlot: {
      updateMany: mocks.slotUpdateMany,
      upsert: mocks.slotUpsert,
      deleteMany: mocks.slotDeleteMany,
    },
    $transaction: mocks.transaction,
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
  // `updateMany`/`upsert` tranzaksiya massivi uchun amal tavsifini qaytaradi.
  mocks.slotUpdateMany.mockImplementation((args: unknown) => ({ op: "updateMany", args }));
  mocks.slotUpsert.mockImplementation((args: unknown) => ({ op: "upsert", args }));
  // Haqiqiy so'rov `id: { in: [...] }` bo'yicha FILTRLAYDI. Stub ham shunday
  // qilishi shart: aks holda bitta sinf so'ralganda ikki qator qaytib,
  // egalik tekshiruvi (uzunliklar tengligi) soxta "topilmadi" berardi.
  mocks.classFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
    const owned = new Set(["class-a", "class-b"]);
    return args.where.id.in.filter((id) => owned.has(id)).map((id) => ({ id }));
  });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("auth birinchi", () => {
  it("axlat input'da ham avval requireOnboarded chaqiriladi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({ slots: "yo'q" });

    expect(calls).toEqual(["requireOnboarded"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.classFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("auth yiqilsa tranzaksiya ochilmaydi", async () => {
    mocks.requireOnboarded.mockRejectedValue(new Error("REDIRECT"));
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await expect(saveScheduleSlots({ slots: [SLOT_A] })).rejects.toThrow("REDIRECT");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("ziddiyat", () => {
  it("bir katakka ikki sinf rad etiladi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({
      slots: [SLOT_A, { teachingClassId: "class-b", weekday: 2, lessonNo: 3 }],
    });

    expect(result).toEqual({ ok: false, error: "band" });
    // BAZAGA BORMAYDI — tekshiruv xotirada.
    expect(mocks.classFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("bir xil sinf bir katakda ikki marta ham rad etiladi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    expect(await saveScheduleSlots({ slots: [SLOT_A, SLOT_A] })).toEqual({
      ok: false,
      error: "band",
    });
  });

  it("turli kunda bir xil lessonNo — ruxsat", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({
      slots: [SLOT_A, { teachingClassId: "class-b", weekday: 3, lessonNo: 3 }],
    });

    expect(result).toEqual({ ok: true });
  });

  it("bir kunda turli lessonNo — ruxsat", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({
      slots: [SLOT_A, { teachingClassId: "class-b", weekday: 2, lessonNo: 4 }],
    });

    expect(result).toEqual({ ok: true });
  });
});

describe("Zod", () => {
  it.each([
    ["weekday 0", { slots: [{ ...SLOT_A, weekday: 0 }] }],
    ["weekday 7 (yakshanba)", { slots: [{ ...SLOT_A, weekday: 7 }] }],
    ["weekday kasr", { slots: [{ ...SLOT_A, weekday: 2.5 }] }],
    ["lessonNo 0", { slots: [{ ...SLOT_A, lessonNo: 0 }] }],
    ["lessonNo 9", { slots: [{ ...SLOT_A, lessonNo: 9 }] }],
    ["teachingClassId bo'sh", { slots: [{ ...SLOT_A, teachingClassId: "" }] }],
    ["slots massiv emas", { slots: SLOT_A }],
    ["slots yo'q", {}],
    [
      "49 ta katak",
      {
        slots: Array.from({ length: 49 }, (_unused, index) => ({
          teachingClassId: "class-a",
          weekday: (index % 6) + 1,
          lessonNo: (index % 8) + 1,
        })),
      },
    ],
  ])("rad etadi: %s", async (_nom, input) => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    expect(await saveScheduleSlots(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("egalik", () => {
  it("begona sinf id'si rad etiladi", async () => {
    mocks.classFindMany.mockResolvedValue([{ id: "class-a" }]);
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({ slots: [SLOT_A, SLOT_B] });

    expect(result).toEqual({ ok: false, error: "topilmadi" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("egalik so'rovi userId va deletedAt bo'yicha filtrlaydi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A, SLOT_B] });

    expect(mocks.classFindMany.mock.calls[0]?.[0].where).toEqual({
      id: { in: ["class-a", "class-b"] },
      userId: "user-1",
      deletedAt: null,
    });
  });

  it("takrorlangan sinf id'si bir marta so'raladi", async () => {
    mocks.classFindMany.mockResolvedValue([{ id: "class-a" }]);
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({
      slots: [SLOT_A, { ...SLOT_A, lessonNo: 4 }],
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.classFindMany.mock.calls[0]?.[0].where.id.in).toEqual(["class-a"]);
  });
});

describe("atomarlik", () => {
  it("butun hafta BITTA $transaction da", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A, SLOT_B] });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    // 1 ta `updateMany` + 2 ta `upsert`.
    expect(mocks.transaction.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("avval updateMany, keyin upsert lar (tartib)", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A, SLOT_B] });

    const ops = mocks.transaction.mock.calls[0]?.[0] as { op: string; args: unknown }[];
    expect(ops.map((op) => op.op)).toEqual(["updateMany", "upsert", "upsert"]);
    // O'chirish o'qituvchining HAMMA katagiga tegishli.
    expect((ops[0]?.args as { where: unknown }).where).toEqual({
      teachingClass: { userId: "user-1" },
      deletedAt: null,
    });
  });

  it("deleteMany ISHLATILMAYDI (CLAUDE.md: hech qachon delete)", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A] });

    expect(mocks.slotDeleteMany).not.toHaveBeenCalled();
  });

  it("upsert o'chirilgan katakni tiriltiradi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A] });

    const args = mocks.slotUpsert.mock.calls[0]?.[0];
    expect(args.update).toEqual({ deletedAt: null });
    expect(args.create).toEqual(SLOT_A);
    expect(args.where.teachingClassId_weekday_lessonNo).toEqual({
      teachingClassId: "class-a",
      weekday: 2,
      lessonNo: 3,
    });
  });

  it("tranzaksiya yiqilsa revalidatePath chaqirilmaydi", async () => {
    mocks.transaction.mockRejectedValue(new Error("tarmoq uzildi"));
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await expect(saveScheduleSlots({ slots: [SLOT_A] })).rejects.toThrow("tarmoq uzildi");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("chekka holatlar", () => {
  it("bo'sh massiv jadvalni tozalaydi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const result = await saveScheduleSlots({ slots: [] });

    expect(result).toEqual({ ok: true });
    // Faqat o'chirish amali, `upsert` yo'q.
    expect(mocks.transaction.mock.calls[0]?.[0]).toHaveLength(1);
    expect(mocks.slotUpsert).not.toHaveBeenCalled();
    // Sinf ro'yxati ham so'ralmaydi — tekshiradigan narsa yo'q.
    expect(mocks.classFindMany).not.toHaveBeenCalled();
  });

  it("lessonsPerWeek mos kelmasa ham SAQLAYDI (ogohlantirish UI ishi)", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    // `class-a` haftada 2 soat deb belgilangan bo'lsa ham, 4 katak saqlanadi.
    const result = await saveScheduleSlots({
      slots: [
        { teachingClassId: "class-a", weekday: 1, lessonNo: 1 },
        { teachingClassId: "class-a", weekday: 2, lessonNo: 1 },
        { teachingClassId: "class-a", weekday: 3, lessonNo: 1 },
        { teachingClassId: "class-a", weekday: 4, lessonNo: 1 },
      ],
    });

    expect(result).toEqual({ ok: true });
  });

  it("to'liq 48 katak qabul qilinadi", async () => {
    mocks.classFindMany.mockResolvedValue([{ id: "class-a" }]);
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    const slots = [];
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      for (let lessonNo = 1; lessonNo <= 8; lessonNo += 1) {
        slots.push({ teachingClassId: "class-a", weekday, lessonNo });
      }
    }

    expect(await saveScheduleSlots({ slots })).toEqual({ ok: true });
  });

  it("[locale] prefiksli yo'llar revalidate qilinadi", async () => {
    const { saveScheduleSlots } = await import("@/server/schedule-actions");

    await saveScheduleSlots({ slots: [SLOT_A] });

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/jadval",
    ]);
  });
});
