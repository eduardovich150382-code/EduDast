import { z } from "zod";

/**
 * Muhit o'zgaruvchilari sxemasi — faqat DOKUMENTATSIYA va ixtiyoriy
 * tekshiruv uchun. Build vaqtida throw QILMAYDI (Vercel preview'larda yoki
 * shu sessiyada hali sozlanmagan sirlar bilan ham build muvaffaqiyatli
 * o'tishi kerak) — shuning uchun barcha maydonlar `.optional()`.
 *
 * Runtime'da haqiqatda kerak bo'lgan joyda (masalan lib/db.ts) alohida
 * tekshiruv qilinadi.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
  // Bot webhook'ini himoya qiluvchi sir (`setWebhook` dagi `secret_token`).
  // Sozlanmagan bo'lsa /api/telegram/webhook butunlay yopiq turadi.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Sessiya JWT'sini imzolash kaliti. Kamida 32 bayt — qat'iy tekshiruv
  // instrumentation.ts (ishga tushish) va lib/auth/session.ts (chaqirilganda)
  // da, bu yerda emas: bu sxema build'ni yiqitmasligi kerak.
  SESSION_SECRET: z.string().optional(),
  DEV_LOGIN_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),

  LLM_MONTHLY_BUDGET_USD: z.coerce.number().optional(),
  GENERATION_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

/** Muhit o'zgaruvchilarini yumshoq tekshiradi — xato tashlamaydi, faqat konsolga yozadi. */
export function checkEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("[env] Ba'zi muhit o'zgaruvchilari noto'g'ri:", parsed.error.flatten().fieldErrors);
    return {} as Env;
  }
  return parsed.data;
}
