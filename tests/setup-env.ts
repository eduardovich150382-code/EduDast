import { config } from "dotenv";

/**
 * Vitest uchun muhit o'zgaruvchilari — har test faylidan OLDIN yuklanadi.
 *
 * NEGA KERAK: Next.js `.env.local` ni o'zi o'qiydi, lekin boshqa
 * ishga tushiruvchilar buni bilmaydi — `prisma.config.ts` da aynan shu
 * sababdan `config({ path: ".env.local" })` turadi, vitest ham xuddi
 * shunday.
 *
 * MUAMMO NIMA EDI: `TEST_DATABASE_URL` ni bitta terminalda `$env:` orqali
 * berish yetarli emas — yangi oyna uni ko'rmaydi va
 * `tests/integration/*` JIMGINA skip bo'ladi (`describe.skipIf`). Skip esa
 * yashil o'tadi, ya'ni integratsiya qamrovi bor deb o'ylab qolish oson.
 * Endi sir faqat `.env.local` da yashaydi (CLAUDE.md 9-qoida) va har
 * ishga tushirishda o'qiladi.
 *
 * `override` BERILMAYDI (sukut bo'yicha `false`): CI yoki qobiqda ataylab
 * berilgan qiymat `.env.local` bilan bosilib ketmasligi kerak.
 */
config({ path: ".env.local" });
