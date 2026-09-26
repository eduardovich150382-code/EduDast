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
    // `.env.local` ni o'qiydi — usiz `tests/integration/*` jimgina skip
    // bo'ladi. Sababi setup faylining o'zida yozilgan.
    setupFiles: ["tests/setup-env.ts"],
  },
});
