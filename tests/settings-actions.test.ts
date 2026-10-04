import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/settings-actions.ts (docs/sessions/12-eslatmalar.md, 7-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 *
 * Qotirib qo'yiladigan shartlar:
 * 1. `requireAuth()` — BIRINCHI await (CLAUDE.md 6-qoida), ya'ni
 *    kirmagan chaqiruvchi Zod xatosidan sxema haqida hech narsa
 *    bilmaydi;
 * 2. yozish faqat validatsiyadan KEYIN;
 * 3. til ro'yxati `routing.locales` dan — qo'lda yozilgan ro'yxat yangi
 *    til qo'shilganda jimgina eskirardi.
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

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.userUpdate } } }));

const { saveLocale, saveReminderPrefs } = await import("@/server/settings-actions");

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAuth.mockImplementation(async () => {
    calls.push("requireAuth");
    return { ...SESSION_USER };
  });
  mocks.userUpdate.mockImplementation(async () => {
    calls.push("update");
    return {};
  });
});

describe("saveReminderPrefs", () => {
  it("auth BIRINCHI await, keyin yozish", async () => {
    const result = await saveReminderPrefs({
      remindersEnabled: false,
      weeklyDigestEnabled: true,
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["requireAuth", "update"]);
  });

  it("ikkala o'girgich BIRGA yoziladi", async () => {
    await saveReminderPrefs({ remindersEnabled: false, weeklyDigestEnabled: false });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { remindersEnabled: false, weeklyDigestEnabled: false },
    });
  });

  it("sozlamalar va bosh sahifa qayta tiklanadi", async () => {
    await saveReminderPrefs({ remindersEnabled: true, weeklyDigestEnabled: true });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[locale]/ish/sozlamalar", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[locale]/ish", "page");
  });

  it.each([
    ["bo'sh obyekt", {}],
    ["bitta maydon yo'q", { remindersEnabled: true }],
    ["satr berilgan", { remindersEnabled: "true", weeklyDigestEnabled: true }],
    ["null", null],
    ["massiv", [true, true]],
    ["undefined", undefined],
  ])("yaroqsiz kirish -> invalid, yozish YO'Q: %s", async (_nom, input) => {
    const result = await saveReminderPrefs(input);

    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  /**
   * Kirmagan foydalanuvchi Zod xatosigacha YETIB BORMASLIGI kerak:
   * `requireAuth` odatda redirect qiladi, bu testda throw bilan
   * modellashtiriladi.
   */
  it("auth yiqilsa validatsiyagacha yetib borilmaydi", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("redirect"));

    await expect(saveReminderPrefs({ buzuq: true })).rejects.toThrow("redirect");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe("saveLocale", () => {
  it.each(["uz", "uz-Cyrl", "ru"])("ruxsat etilgan til: %s", async (locale) => {
    const result = await saveLocale({ locale });

    expect(result).toEqual({ ok: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { locale },
    });
  });

  it("auth BIRINCHI await", async () => {
    await saveLocale({ locale: "ru" });
    expect(calls).toEqual(["requireAuth", "update"]);
  });

  it.each([
    ["ro'yxatdan tashqari", { locale: "en" }],
    ["bo'sh satr", { locale: "" }],
    ["katta harf", { locale: "UZ" }],
    ["kirill varianti xato yozilgan", { locale: "uz-cyrl" }],
    ["maydon yo'q", {}],
    ["null", null],
  ])("yaroqsiz til -> invalid, yozish YO'Q: %s", async (_nom, input) => {
    const result = await saveLocale(input);

    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
