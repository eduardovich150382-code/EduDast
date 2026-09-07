/**
 * Lokal ishlash uchun dev bypass (docs/sessions/02-auth.md, 3-band).
 *
 * Telegram Login localhost'da ishlamaydi — BotFather widget uchun haqiqiy
 * domen talab qiladi. Shu sabab lokalda seed'dagi test o'qituvchisiga
 * kiradigan tugma bor.
 *
 * PRODUCTION'DA QANDAY O'CHADI — uch qatlam:
 *  1. Render joyi: /kirish sahifasida shart LITERAL holda inline yozilgan,
 *     shuning uchun bundler `"production" === "development"` ni `false` ga
 *     yig'adi va butun tarmoq o'chadi.
 *  2. `DEV_LOGIN_ENABLED` da `NEXT_PUBLIC_` prefiksi yo'q → client
 *     bundle'da u har doim `undefined`. Tugma sof server komponent.
 *  3. `assertDevLoginAllowed()` — server action ichidagi runtime qorovul.
 *
 * Halol ogohlantirish: server action modulining O'ZI server bundle'da
 * qolishi mumkin (cross-module tree-shaking kafolatlanmaydi). Kafolati
 * bor narsa — tugma render bo'lmaydi va action darhol throw qiladi.
 */

/**
 * Seed'dagi test o'qituvchisining Telegram ID'si. Haqiqiy Telegram ID'lari
 * bilan to'qnashmasligi uchun ataylab shu diapazondan olingan.
 * BigInt literal (`999000001n`) tsconfig target ES2017 da mavjud emas.
 */
export const DEV_TELEGRAM_ID = BigInt("999000001");

/**
 * Ikkala shart ham modul darajasida, literal solishtirish bilan — shu
 * shakl bundler tomonidan konstantaga yig'iladi.
 */
export const DEV_LOGIN_AVAILABLE =
  process.env.NODE_ENV === "development" && process.env.DEV_LOGIN_ENABLED === "true";

export function assertDevLoginAllowed(): void {
  if (!DEV_LOGIN_AVAILABLE) {
    throw new Error("Dev login o'chirilgan.");
  }
}
