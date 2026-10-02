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
    // ORASIDA qayta ishlatadi (default `false`) — sovuq start shu bilan
    // tezlashadi, ayniqsa CI'da.
    //
    // Kesh `node_modules/.vitest-cache` da (NE `node_modules/.vite` —
    // u Vite'ning dep-optimizer keshi, butunlay boshqa narsa). Ya'ni
    // transform keshini qo'lda tozalash uchun AYNAN shu papkani o'chirish
    // kerak; `.vite` ni o'chirish unga tegmaydi. `node_modules` ichida
    // bo'lgani uchun bog'liqliklar qayta o'rnatilganda o'zi yaroqsiz
    // bo'ladi.
    //
    // O'lchangan ta'siri (58 fayl / 2316 test): sovuq keshda transform
    // vaqtning 17%i, issiqda 3%i. Har `vitest run` alohida protsess, ya'ni
    // bu tushish faqat diskdagi keshdan keladi.
    fsModuleCache: true,
    // `.env.local` ni o'qiydi — usiz `tests/integration/*` jimgina skip
    // bo'ladi. Sababi setup faylining o'zida yozilgan.
    setupFiles: ["tests/setup-env.ts"],
  },
});
