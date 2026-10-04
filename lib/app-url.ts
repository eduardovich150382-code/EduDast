/**
 * Ilovaning absolyut baza manzili.
 *
 * NEGA KERAK: sahifa va webhook `request.nextUrl.origin` dan foydalanadi
 * (`app/[locale]/kirish/page.tsx` shunday qiladi), lekin CRON kontekstida
 * so'rov origin'i ishonchli emas va bot xabaridagi havola absolyut
 * bo'lishi SHART — Telegram nisbiy yo'lni bosib ochmaydi.
 *
 * NEGA THROW QILMAYDI: `lib/env.ts` ning intizomi — sir yoki sozlama
 * yo'q bo'lsa xato tashlamay DEGRADATSIYA qilinadi. Manzil topilmasa
 * eslatma xabari havolasiz ketadi; xabarning o'zi hali ham foydali
 * ("ertaga 2 ta darsga material yo'q"), cron esa yiqilmaydi.
 */

/**
 * Indeks imzosi bilan, `{ NEXT_PUBLIC_APP_URL?: string }` kabi aniq
 * shaklda EMAS: TypeScript'ning "weak type" tekshiruvi `process.env`
 * (`ProcessEnv`) ni bunday turga bermaydi ("no properties in common"),
 * chunki Next.js `ProcessEnv` ni o'z kalitlari bilan to'ldiradi.
 */
type EnvLike = Record<string, string | undefined>;

export function appBaseUrl(env: EnvLike = process.env): string | null {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  // `VERCEL_PROJECT_PRODUCTION_URL` — loyihaning DOIMIY prod hosti.
  //
  // `VERCEL_URL` ATAYLAB ishlatilmaydi: u har deploy uchun alohida manzil,
  // ya'ni Telegram xabariga preview hostini qotirib qo'yardi va o'sha
  // deploy o'chgach havola o'lik bo'lib qolardi. Xabar esa bazada emas,
  // foydalanuvchining Telegram tarixida abadiy qoladi.
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/+$/, "");
  if (production) return `https://${production}`;

  return null;
}
