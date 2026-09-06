import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/client";

/**
 * Runtime ulanishi — DATABASE_URL (Neon pooled) orqali, @prisma/adapter-neon
 * bilan. Migratsiya uchun DIRECT_URL ishlatiladi (qarang: prisma.config.ts).
 *
 * Next.js dev rejimida HMR har fayl o'zgarishida modulni qayta yuklaydi —
 * shuning uchun global singleton ishlatamiz, aks holda har reload'da yangi
 * ulanish puli ochilib, Neon'ning ulanish limitiga tez yetib boradi.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
