import { config } from "dotenv";

/**
 * `.env.local` ni yuklaydi — `tsx prisma/seed-demo.ts` kabi TO'G'RIDAN-TO'G'RI
 * ishga tushirilgan skriptlar uchun.
 *
 * `pnpm db:seed` buni talab qilmaydi: u `prisma db seed` orqali ketadi va
 * Prisma CLI `prisma.config.ts` ni o'qiydi, u esa o'zi `config()` chaqiradi.
 * To'g'ridan-to'g'ri `tsx` da esa hech kim o'qimaydi va `lib/db.ts`
 * `DATABASE_URL` ni topmaydi.
 *
 * ALOHIDA MODUL, chunki ES import'lari KO'TARILADI: `config()` ni oddiy
 * ko'rsatma sifatida yozsak, u `lib/db.ts` import qilinganidan KEYIN
 * bajarilardi — ya'ni kech bo'lardi. Import'lar tartib bilan bajariladi,
 * shuning uchun bu modulni birinchi import qilish yetarli.
 */
config({ path: ".env.local" });
