import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/onboarding-actions.ts (docs/sessions/02-auth.md, 4-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 */

class RedirectSentinel extends Error {
  args: { href: string; locale: string };
  constructor(args: { href: string; locale: string }) {
    super("REDIRECT");
    this.args = args;
  }
}

const SESSION_USER = {
  id: "user-1",
  fullName: "Test",
  username: null,
  role: "TEACHER",
  region: null,
  subjects: [] as string[],
  grades: [] as number[],
  locale: "uz",
  creditBalance: 0,
  sessionVersion: 5,
};

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  setSessionCookie: vi.fn(async () => {}),
  getLocale: vi.fn(async () => "uz"),
  redirect: vi.fn((args: { href: string; locale: string }) => {
    throw new RedirectSentinel(args);
  }),
  userUpdate: vi.fn(),
  subjectFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/cookies", () => ({ setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { update: mocks.userUpdate },
    subject: { findMany: mocks.subjectFindMany },
  },
}));
vi.mock("@/lib/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale }));

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAuth.mockImplementation(async () => {
    calls.push("requireAuth");
    return { ...SESSION_USER };
  });
  mocks.getLocale.mockResolvedValue("uz");
  mocks.redirect.mockImplementation((args: { href: string; locale: string }) => {
    throw new RedirectSentinel(args);
  });
});

describe("saveSubjects", () => {
  it("axlat input'da ham avval requireAuth chaqiriladi", async () => {
    mocks.subjectFindMany.mockResolvedValue([]);
    const { saveSubjects } = await import("@/server/onboarding-actions");

    const result = await saveSubjects({ subjects: [] });

    expect(calls).toEqual(["requireAuth"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["bo'sh massiv", { subjects: [] }],
    ["raqamlar", { subjects: [123] }],
    ["31 element", { subjects: Array.from({ length: 31 }, (_, i) => `fan-${i}`) }],
    ["butunlay boshqa shakl", { subjects: "fizika" }],
    ["maydon yo'q", {}],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { saveSubjects } = await import("@/server/onboarding-actions");

    expect(await saveSubjects(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("bazada yo'q slug bo'lsa rad etadi", async () => {
    mocks.subjectFindMany.mockResolvedValue([{ slug: "fizika" }]);
    const { saveSubjects } = await import("@/server/onboarding-actions");

    const result = await saveSubjects({ subjects: ["fizika", "mavjud-emas"] });

    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("to'g'ri payload — update chaqiradi va onb hisoblab cookie qo'yadi", async () => {
    mocks.subjectFindMany.mockResolvedValue([{ slug: "fizika" }, { slug: "kimyo" }]);
    mocks.userUpdate.mockResolvedValue({ subjects: ["fizika", "kimyo"], grades: [], region: null });
    const { saveSubjects } = await import("@/server/onboarding-actions");

    const result = await saveSubjects({ subjects: ["fizika", "kimyo", "fizika"] });

    expect(result).toEqual({ ok: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { subjects: ["fizika", "kimyo"] },
      select: { subjects: true, grades: true, region: true },
    });
    // subjects to'ldirilgan, grades/region hali yo'q -> onboarding tugamagan
    expect(mocks.setSessionCookie).toHaveBeenCalledWith({ sub: "user-1", onb: false, sv: 5 });
  });
});

describe("saveGrades", () => {
  it.each([
    ["0-sinf", { grades: [0] }],
    ["12-sinf", { grades: [12] }],
    ["satr", { grades: ["7"] }],
    ["bo'sh", { grades: [] }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { saveGrades } = await import("@/server/onboarding-actions");

    expect(await saveGrades(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("to'g'ri payload — saralanadi, dublikatlar olib tashlanadi", async () => {
    mocks.userUpdate.mockResolvedValue({ subjects: ["fizika"], grades: [7, 8], region: "andijon" });
    const { saveGrades } = await import("@/server/onboarding-actions");

    const result = await saveGrades({ grades: [8, 7, 8] });

    expect(result).toEqual({ ok: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { grades: [7, 8] },
      select: { subjects: true, grades: true, region: true },
    });
    // uchala maydon ham to'ldirilgan -> onboarding tugagan
    expect(mocks.setSessionCookie).toHaveBeenCalledWith({ sub: "user-1", onb: true, sv: 5 });
  });
});

describe("saveRegion", () => {
  it("noma'lum viloyat kodi rad etiladi", async () => {
    const { saveRegion } = await import("@/server/onboarding-actions");

    expect(await saveRegion({ region: "mars" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("muvaffaqiyatda /ish ga yo'naltiradi", async () => {
    mocks.userUpdate.mockResolvedValue({
      subjects: ["fizika"],
      grades: [7],
      region: "samarqand",
    });
    const { saveRegion } = await import("@/server/onboarding-actions");

    await expect(saveRegion({ region: "samarqand" })).rejects.toThrow(RedirectSentinel);

    expect(mocks.setSessionCookie).toHaveBeenCalledWith({ sub: "user-1", onb: true, sv: 5 });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/ish", locale: "uz" });
  });

  it("noto'g'ri payloadda hech qanday yon ta'sir bo'lmaydi", async () => {
    const { saveRegion } = await import("@/server/onboarding-actions");

    await saveRegion({ region: "" });

    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
