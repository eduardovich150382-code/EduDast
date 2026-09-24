/**
 * Byudjet chegaralari va vaqt zonasi.
 *
 * NEGA TOSHKENT VAQTI: "kunlik" shift UTC bo'yicha hisoblansa, u
 * O'zbekistonda soat 05:00 da tiklanadi. Operator ertalab hisobotga qarab
 * "kecha nega shiftga yetdik?" deb hayron bo'ladi. Kun chegarasi
 * foydalanuvchi yashaydigan vaqt bo'yicha bo'lishi kerak.
 */

/** O'zbekiston UTC+5, yozgi vaqtga o'tmaydi — shuning uchun qat'iy ofset. */
export const TASHKENT_UTC_OFFSET_HOURS = 5;

/** `process.env` ga mos, lekin testda to'liq ProcessEnv yasash shart emas. */
export type EnvLike = Record<string, string | undefined>;

export type BudgetLimits = {
  monthlyUsd: number | null;
  dailyUsd: number | null;
  userDailyUsd: number | null;
  /** Shu nisbatdan oshsa arzon modelga tushiladi. */
  downgradeAt: number;
  /** Shu nisbatdan oshsa chaqiruv umuman qilinmaydi. */
  denyAt: number;
  generationEnabled: boolean;
};

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readLimits(env: EnvLike = process.env): BudgetLimits {
  return {
    monthlyUsd: num(env.LLM_MONTHLY_BUDGET_USD),
    dailyUsd: num(env.LLM_DAILY_BUDGET_USD),
    userDailyUsd: num(env.LLM_USER_DAILY_BUDGET_USD),
    downgradeAt: 0.8,
    denyAt: 1,
    // Sozlanmagan bo'lsa generatsiya YOQIQ deb hisoblanmaydi — ataylab.
    // Bu qiymat `.env.example` da "false" bilan keladi va uni ongli ravishda
    // yoqish kerak.
    generationEnabled: env.GENERATION_ENABLED === "true",
  };
}

/** Toshkent vaqti bo'yicha kun boshlanishi (UTC `Date` sifatida). */
export function tashkentDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
  const dayStartShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(dayStartShifted - TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
}

/** Toshkent vaqti bo'yicha oy boshlanishi (UTC `Date` sifatida). */
export function tashkentMonthStart(now: Date): Date {
  const shifted = new Date(now.getTime() + TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
  const monthStartShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    1,
  );
  return new Date(monthStartShifted - TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
}
