import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditError } from "@/lib/credits/errors";

/**
 * server/credit-actions.ts (CLAUDE.md 8-qoida: har server action = yangi test).
 *
 * Eng muhim tekshiruv: `requireAdmin()` Zod'dan OLDIN ishlaydi. Uslub
 * `tests/admin-actions.test.ts` dan — `calls` massivi chaqiruv TARTIBINI
 * yozib oladi, chunki "ikkalasi ham chaqirilgan" yetarli emas: tartib
 * buzilsa kirmagan chaqiruvchi sxema haqida ma'lumot olardi.
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
  grant: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/credits/ledger", () => ({ grant: mocks.grant }));

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAdmin.mockImplementation(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", role: "ADMIN" };
  });
  mocks.grant.mockImplementation(async () => {
    calls.push("grant");
    return 70;
  });
});

describe("grantCredits — qorovul", () => {
  it("ADMIN bo'lmasa hech narsa yozilmaydi", async () => {
    mocks.requireAdmin.mockImplementation(async () => {
      throw new NotFoundSentinel();
    });
    const { grantCredits } = await import("@/server/credit-actions");

    await expect(grantCredits({ userId: "u1", amount: 10 })).rejects.toThrow(NotFoundSentinel);

    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("axlat input'da ham AVVAL requireAdmin chaqiriladi", async () => {
    const { grantCredits } = await import("@/server/credit-actions");

    const result = await grantCredits({ nonsense: true });

    expect(calls).toEqual(["requireAdmin"]);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});

describe("grantCredits — validatsiya", () => {
  it.each([
    ["userId yo'q", { amount: 10 }],
    ["amount nol", { userId: "u1", amount: 0 }],
    ["amount manfiy", { userId: "u1", amount: -5 }],
    ["amount kasr", { userId: "u1", amount: 2.5 }],
    ["amount chegaradan katta", { userId: "u1", amount: 1001 }],
    ["amount satr", { userId: "u1", amount: "5" }],
    ["userId bo'sh", { userId: "", amount: 10 }],
  ])("Zod rad etadi: %s", async (_nom, input) => {
    const { grantCredits } = await import("@/server/credit-actions");

    expect(await grantCredits(input)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});

describe("grantCredits — muvaffaqiyat", () => {
  it("kredit beradi, refId'da adminning izi qoladi va keshni yangilaydi", async () => {
    const { grantCredits } = await import("@/server/credit-actions");

    const result = await grantCredits({ userId: "u1", amount: 25 });

    expect(result).toEqual({ ok: true, balanceAfter: 70 });
    expect(mocks.grant).toHaveBeenCalledWith("u1", 25, "admin:admin-1");
    expect(calls).toEqual(["requireAdmin", "grant"]);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });
});

describe("grantCredits — xatolar", () => {
  it("foydalanuvchi topilmasa 'topilmadi' qaytaradi", async () => {
    mocks.grant.mockRejectedValue(new CreditError("user_not_found", "yo'q"));
    const { grantCredits } = await import("@/server/credit-actions");

    expect(await grantCredits({ userId: "u1", amount: 10 })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("boshqa kredit xatosi 'xato' bo'ladi", async () => {
    mocks.grant.mockRejectedValue(new CreditError("invalid_amount", "noto'g'ri"));
    const { grantCredits } = await import("@/server/credit-actions");

    expect(await grantCredits({ userId: "u1", amount: 10 })).toEqual({ ok: false, error: "xato" });
  });

  /**
   * Baza uzilgani domen xatosi EMAS — uni "xato" deb yutish nosozlikni
   * jimgina yashirardi va Sentry hech narsa ko'rmasdi.
   */
  it("kredit xatosi bo'lmagan xato yuqoriga tashlanadi", async () => {
    mocks.grant.mockRejectedValue(new Error("Neon uzildi"));
    const { grantCredits } = await import("@/server/credit-actions");

    await expect(grantCredits({ userId: "u1", amount: 10 })).rejects.toThrow("Neon uzildi");
  });
});
