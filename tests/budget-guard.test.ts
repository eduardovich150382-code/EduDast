import { describe, expect, it } from "vitest";
import { decideBudget, type BudgetInput } from "@/lib/budget/guard";
import { readLimits, tashkentDayStart, tashkentMonthStart } from "@/lib/budget/limits";

const input = (over: Partial<BudgetInput> = {}): BudgetInput => ({
  limits: {
    monthlyUsd: 100,
    dailyUsd: null,
    userDailyUsd: null,
    downgradeAt: 0.8,
    denyAt: 1,
    generationEnabled: true,
  },
  spend: { monthUsd: 0, dayUsd: 0, userDayUsd: 0, providerDayCalls: {} },
  estimateUsd: 0,
  provider: "anthropic",
  freeTierRpd: null,
  ...over,
});

describe("byudjet chegaralari", () => {
  it("79 % — to'liq", () => {
    const v = decideBudget(input({ spend: spend({ monthUsd: 79 }) }));
    expect(v.kind).toBe("full");
  });

  it("80 % — arzon modelga tushadi", () => {
    const v = decideBudget(input({ spend: spend({ monthUsd: 80 }) }));
    expect(v).toEqual({ kind: "downgrade", reason: "monthly" });
  });

  it("99 % — hali arzonlashtirish", () => {
    expect(decideBudget(input({ spend: spend({ monthUsd: 99 }) })).kind).toBe("downgrade");
  });

  it("100 % — rad etiladi", () => {
    expect(decideBudget(input({ spend: spend({ monthUsd: 100 }) }))).toEqual({
      kind: "deny",
      reason: "monthly",
    });
  });

  it("taxminiy narx ham hisobga olinadi", () => {
    // 79 sarflangan, shift 100. Bitta chaqiruv $25 tursa — 104 %, rad.
    expect(decideBudget(input({ spend: spend({ monthUsd: 79 }), estimateUsd: 25 })).kind).toBe(
      "deny",
    );
  });

  it("shift 0 bo'lsa hech qanday chaqiruv o'tmaydi", () => {
    const v = decideBudget(
      input({ limits: { ...input().limits, monthlyUsd: 0 }, spend: spend({}) }),
    );
    expect(v).toEqual({ kind: "deny", reason: "monthly" });
  });

  it("shift belgilanmagan bo'lsa tekshirilmaydi", () => {
    const v = decideBudget(
      input({ limits: { ...input().limits, monthlyUsd: null }, spend: spend({ monthUsd: 1e6 }) }),
    );
    expect(v.kind).toBe("full");
  });
});

describe("qaysi shift birinchi ishlaydi", () => {
  it("kunlik shift oylikdan oldin tugasa — kunlik sabab", () => {
    const v = decideBudget(
      input({
        limits: { ...input().limits, monthlyUsd: 1000, dailyUsd: 10 },
        spend: spend({ monthUsd: 50, dayUsd: 10 }),
      }),
    );
    expect(v).toEqual({ kind: "deny", reason: "daily" });
  });

  it("foydalanuvchi shifti alohida ishlaydi", () => {
    const v = decideBudget(
      input({
        limits: { ...input().limits, monthlyUsd: 1000, userDailyUsd: 1 },
        spend: spend({ monthUsd: 5, userDayUsd: 1 }),
      }),
    );
    expect(v).toEqual({ kind: "deny", reason: "user-daily" });
  });

  it("deny downgrade'dan ustun — eng qat'iy hukm qaytadi", () => {
    const v = decideBudget(
      input({
        limits: { ...input().limits, monthlyUsd: 100, dailyUsd: 10 },
        // oylik 85 % (downgrade), kunlik 100 % (deny)
        spend: spend({ monthUsd: 85, dayUsd: 10 }),
      }),
    );
    expect(v.kind).toBe("deny");
  });
});

describe("avariya tugmasi va bepul kvota", () => {
  it("GENERATION_ENABLED=false — hamma narsadan ustun", () => {
    const v = decideBudget(
      input({ limits: { ...input().limits, generationEnabled: false }, spend: spend({}) }),
    );
    expect(v).toEqual({ kind: "deny", reason: "disabled" });
  });

  it("bepul kvota tugashi — rad etish emas, arzonlashtirish", () => {
    const v = decideBudget(
      input({
        provider: "gemini",
        freeTierRpd: 200,
        spend: spend({ providerDayCalls: { gemini: 200 } }),
      }),
    );
    expect(v).toEqual({ kind: "downgrade", reason: "free-quota" });
  });

  it("kvota ichida bo'lsa tegilmaydi", () => {
    const v = decideBudget(
      input({
        provider: "gemini",
        freeTierRpd: 200,
        spend: spend({ providerDayCalls: { gemini: 199 } }),
      }),
    );
    expect(v.kind).toBe("full");
  });
});

describe("readLimits", () => {
  it("bo'sh va yaroqsiz qiymat — shift yo'q", () => {
    const l = readLimits({
      LLM_MONTHLY_BUDGET_USD: "",
      LLM_DAILY_BUDGET_USD: "abc",
      LLM_USER_DAILY_BUDGET_USD: "-5",
    });
    expect(l.monthlyUsd).toBeNull();
    expect(l.dailyUsd).toBeNull();
    expect(l.userDailyUsd).toBeNull();
  });

  it("generationEnabled faqat \"true\" bilan yoqiladi", () => {
    expect(readLimits({}).generationEnabled).toBe(false);
    expect(
      readLimits({ GENERATION_ENABLED: "true" }).generationEnabled,
    ).toBe(true);
  });
});

describe("Toshkent vaqti chegaralari", () => {
  it("kun chegarasi mahalliy yarim tunda, UTC'da emas", () => {
    // 2026-09-24 20:00 UTC = 25-sentyabr 01:00 Toshkentda.
    // Demak kun boshlanishi 24-sentyabr 19:00 UTC (= 25-sentyabr 00:00 mahalliy).
    const start = tashkentDayStart(new Date("2026-09-24T20:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-24T19:00:00.000Z");
  });

  it("UTC bo'yicha hali eski kun bo'lsa ham mahalliy yangi kun", () => {
    // 2026-09-24 22:00 UTC = 25-sentyabr 03:00 mahalliy.
    const a = tashkentDayStart(new Date("2026-09-24T22:00:00Z"));
    const b = tashkentDayStart(new Date("2026-09-25T02:00:00Z"));
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it("mahalliy kun 05:00 da emas, 00:00 da almashadi", () => {
    // 24-sent 18:59 UTC = 23:59 mahalliy (hali 24-kun)
    // 24-sent 19:01 UTC = 00:01 mahalliy (endi 25-kun)
    const before = tashkentDayStart(new Date("2026-09-24T18:59:00Z"));
    const after = tashkentDayStart(new Date("2026-09-24T19:01:00Z"));
    expect(before.toISOString()).not.toBe(after.toISOString());
  });

  it("oy chegarasi ham mahalliy vaqt bo'yicha", () => {
    // 2026-09-30 20:00 UTC = 1-oktabr 01:00 mahalliy -> oktabr oyi.
    const start = tashkentMonthStart(new Date("2026-09-30T20:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-30T19:00:00.000Z");
  });
});

function spend(over: Partial<BudgetInput["spend"]>): BudgetInput["spend"] {
  return { monthUsd: 0, dayUsd: 0, userDayUsd: 0, providerDayCalls: {}, ...over };
}
