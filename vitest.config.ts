import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig.json dagi `"@/*": ["./*"]` alias'ining vitest uchun nusxasi —
  // usiz testlar `@/lib/...` importini hal qila olmaydi. Alohida paket
  // (vite-tsconfig-paths) qo'shishga hojat yo'q, alias bitta.
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Transform qilingan modullarni diskda keshlaydi va yugurishlar
    // ORASIDA qayta ishlatadi (default `false`). Sovuq start aynan shu
    // bilan tezlashadi — `tests/cron-embeddings.test.ts` dagi birinchi test
    // marshrut modulining butun daraxtini O'Z byudjeti ichida transform
    // qiladi va shift shu yerdan chiqadi.
    //
    // Kesh `node_modules/.vite` ichida (ishchi makon ildizi), ya'ni
    // bog'liqliklar qayta o'rnatilganda o'zi yaroqsiz bo'ladi — qo'lda
    // tozalash kerak emas.
    //
    // DIQQAT: bu BIRINCHI sovuq yugurishga yordam bermaydi (keshda hali
    // hech narsa yo'q) — shuning uchun o'sha testdagi alohida timeout ham
    // kerak. Ikkisi bir-birining o'rnini bosmaydi.
    fsModuleCache: true,
    // `.env.local` ni o'qiydi — usiz `tests/integration/*` jimgina skip
    // bo'ladi. Sababi setup faylining o'zida yozilgan.
    setupFiles: ["tests/setup-env.ts"],
  },
});
