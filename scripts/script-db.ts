import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../lib/generated/prisma/client";

/**
 * CLI skriptlar uchun Prisma client.
 *
 * NEGA lib/db.ts EMAS: u `DATABASE_URL` (Neon pooled) bilan ulanadi va
 * global singleton'da yashaydi — Next.js runtime uchun to'g'ri, skript
 * uchun emas. PgBouncer transaction pooling ortida uzun interaktiv
 * tranzaksiya (`$transaction(async (tx) => ...)`) ishonchli ishlamaydi,
 * import esa aynan shunga tayanadi. Shuning uchun `DIRECT_URL` —
 * prisma.config.ts CLI uchun aynan shu manzilni beradi.
 */
export function createScriptDb(): PrismaClient {
  // Next.js .env.local'ni o'zi o'qiydi, tsx esa yo'q.
  config({ path: ".env.local" });

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error(
      "DIRECT_URL sozlanmagan. .env.local ga Neon'ning 'Direct connection' manzilini qo'ying (.env.example ga qarang).",
    );
  }

  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}
