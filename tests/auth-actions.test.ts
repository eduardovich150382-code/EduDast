import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * server/auth-actions.ts (docs/sessions/02-auth.md, 3-band + CLAUDE.md
 * 8-qoida: har server action = yangi vitest testi).
 *
 * Barcha tashqi bog'liqliklar mock qilingan — bu yerda faqat action'ning
 * O'ZI test qilinadi (bazaga, cookie'ga, next-intl'ga emas).
 */

const mocks = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(async () => {}),
  setSessionCookie: vi.fn(async () => {}),
  getLocale: vi.fn(async () => "uz"),
  findFirstOrThrow: vi.fn(),
  redirect: vi.fn((args: { href: string; locale: string }) => {
    throw new RedirectSentinel(args);
  }),
}));

class RedirectSentinel extends Error {
  args: { href: string; locale: string };
  constructor(args: { href: string; locale: string }) {
    super("REDIRECT");
    this.args = args;
  }
}

vi.mock("@/lib/auth/cookies", () => ({
  clearSessionCookie: mocks.clearSessionCookie,
  setSessionCookie: mocks.setSessionCookie,
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findFirstOrThrow: mocks.findFirstOrThrow } },
}));

vi.mock("@/lib/i18n/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next-intl/server", () => ({
  getLocale: mocks.getLocale,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocale.mockResolvedValue("uz");
  mocks.redirect.mockImplementation((args: { href: string; locale: string }) => {
    throw new RedirectSentinel(args);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("logout", () => {
  it("cookie'ni tozalaydi va /kirish ga yo'naltiradi", async () => {
    const { logout } = await import("@/server/auth-actions");

    await expect(logout()).rejects.toThrow(RedirectSentinel);

    expect(mocks.clearSessionCookie).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/kirish", locale: "uz" });
  });

  it("cookie avval tozalanadi, keyin yo'naltiriladi", async () => {
    const order: string[] = [];
    mocks.clearSessionCookie.mockImplementationOnce(async () => {
      order.push("clear");
    });
    mocks.redirect.mockImplementationOnce((args: { href: string; locale: string }) => {
      order.push("redirect");
      throw new RedirectSentinel(args);
    });

    const { logout } = await import("@/server/auth-actions");
    await expect(logout()).rejects.toThrow(RedirectSentinel);

    expect(order).toEqual(["clear", "redirect"]);
  });
});

describe("devLogin — o'chirilgan holatda (standart)", () => {
  it("throw qiladi va bazaga bormaydi", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_LOGIN_ENABLED", "false");

    const { devLogin } = await import("@/server/auth-actions");

    await expect(devLogin()).rejects.toThrow("Dev login o'chirilgan.");
    expect(mocks.findFirstOrThrow).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("production'da DEV_LOGIN_ENABLED=true bo'lsa ham throw qiladi", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");

    const { devLogin } = await import("@/server/auth-actions");

    await expect(devLogin()).rejects.toThrow("Dev login o'chirilgan.");
  });
});

describe("devLogin — yoqilgan holatda (dev muhit)", () => {
  it("dev foydalanuvchi sessiyasini qo'yadi va onboarding holatiga qarab yo'naltiradi", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    mocks.findFirstOrThrow.mockResolvedValueOnce({
      id: "dev-user-1",
      subjects: [],
      grades: [],
      region: null,
      sessionVersion: 0,
    });

    const { devLogin } = await import("@/server/auth-actions");
    const { DEV_TELEGRAM_ID } = await import("@/lib/auth/dev-login");

    await expect(devLogin()).rejects.toThrow(RedirectSentinel);

    expect(mocks.findFirstOrThrow).toHaveBeenCalledWith({
      where: { telegramId: DEV_TELEGRAM_ID, deletedAt: null },
      select: expect.any(Object) as unknown,
    });
    expect(mocks.setSessionCookie).toHaveBeenCalledWith({
      sub: "dev-user-1",
      onb: false,
      sv: 0,
    });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/onboarding", locale: "uz" });
  });

  it("onboarding tugagan dev foydalanuvchi uchun /ish ga yo'naltiradi", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    mocks.findFirstOrThrow.mockResolvedValueOnce({
      id: "dev-user-1",
      subjects: ["fizika"],
      grades: [7],
      region: "andijon",
      sessionVersion: 2,
    });

    const { devLogin } = await import("@/server/auth-actions");

    await expect(devLogin()).rejects.toThrow(RedirectSentinel);

    expect(mocks.setSessionCookie).toHaveBeenCalledWith({
      sub: "dev-user-1",
      onb: true,
      sv: 2,
    });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/ish", locale: "uz" });
  });
});
