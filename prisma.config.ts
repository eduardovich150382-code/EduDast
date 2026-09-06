import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js .env.local'ni o'zi o'qiydi, lekin Prisma CLI buni bilmaydi —
// shuning uchun shu yerda aniq ko'rsatib beramiz (foydalanuvchi sirlarni
// faqat .env.local ga yozadi, .env emas).
config({ path: ".env.local" });

// DIRECT_URL hali sozlanmagan bo'lsa ham (masalan `pnpm install` birinchi
// marta, .env.local yo'q) `prisma generate` ishlashi kerak — u DB'ga
// ulanmaydi, faqat schema'ni o'qiydi. Shuning uchun `env()` helper (yo'q
// bo'lsa throw qiladi) o'rniga oddiy fallback bilan process.env ishlatiladi.
// Haqiqiy ulanish faqat `prisma migrate dev` / `prisma db seed` vaqtida
// kerak — o'shanda DIRECT_URL .env.local'da bo'lishi shart.
const directUrl =
  process.env.DIRECT_URL ?? "postgresql://localhost:5432/edudast_placeholder";

// Prisma 7'da ulanish URL'i schema.prisma emas, shu yerda beriladi.
// CLI (migrate/studio/seed) DIRECT_URL orqali ulanadi — Neon'ning to'g'ridan
// -to'g'ri (pooled bo'lmagan) manzili, chunki migratsiya DDL'lari pgbouncer
// pool orqali ishonchli ishlamaydi. Runtime'dagi PrismaClient esa (lib/db.ts)
// DATABASE_URL (pooled) bilan @prisma/adapter-neon orqali alohida ulanadi.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
  },
});
