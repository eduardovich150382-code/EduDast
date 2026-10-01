/**
 * Demo seed'ning prod qo'riqchisi — `prisma/seed-demo.ts` uchun.
 *
 * ALOHIDA MODUL, chunki `seed-demo.ts` import qilinishi bilan `main()` ni
 * ishga tushiradi: uni testdan import qilib bo'lmaydi. Qo'riqchi mantig'i esa
 * aynan test qilinishi kerak bo'lgan joy — pastdagi `normalizeNeonHost`
 * izohiga qarang.
 */

/**
 * Neon host nomini solishtirish uchun normallashtiradi.
 *
 * `DATABASE_URL` pooled host'ga qaraydi (`...-pooler.c-5...`), `DIRECT_URL`
 * esa pooled bo'lmaganiga (`....c-5...`) — bu AYNI bazaning ikki nomi. Neon
 * konsoli ko'pincha pooled bo'lmagan nomni ko'rsatadi, ya'ni odam
 * `PROD_DATABASE_HOST` ga o'shani yozadi va oddiy `===` solishtiruv JIMGINA
 * mos kelmasdi — qo'riqchi bor bo'lib, ishlamasdi.
 */
export function normalizeNeonHost(host: string): string {
  return host.toLowerCase().replace(/-pooler(?=\.|$)/, "");
}

/**
 * Prod belgilari ro'yxati. Bo'sh massiv — prod emas.
 *
 * `env` parametr sifatida olinadi, `process.env` to'g'ridan-to'g'ri emas:
 * shunda testda muhit o'zgaruvchilarini buzmasdan tekshirish mumkin.
 */
export function productionSignals(env: NodeJS.ProcessEnv): string[] {
  const signals: string[] = [];

  if (env.NODE_ENV === "production") signals.push("NODE_ENV=production");
  if (env.VERCEL_ENV === "production") signals.push("VERCEL_ENV=production");

  const prodHost = env.PROD_DATABASE_HOST?.trim();
  if (!prodHost) return signals;

  const target = normalizeNeonHost(prodHost);
  // IKKALA URL ham tekshiriladi: `DATABASE_URL` (pooled, runtime) va
  // `DIRECT_URL` (migratsiya/seed). Bittasi prod'ga qarasa — bu prod baza.
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = env[key];
    if (!value) continue;

    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      // JIM QOLMAYDI: o'qilmagan URL — qo'riqchi ishlamagani bilan teng,
      // shuning uchun u ham prod signali sifatida sanaladi.
      signals.push(`${key} o'qib bo'lmadi`);
      continue;
    }

    if (normalizeNeonHost(host) === target) {
      signals.push(`${key} prod host'ga qaragan (${host})`);
    }
  }

  return signals;
}

/**
 * Prod belgisi bo'lsa throw qiladi. `--force` chetlab o'tadi, lekin chetlab
 * o'tish ATAYLAB noqulay — bayroqni yozayotgan odam nima qilayotganini
 * bilishi kerak.
 */
export function assertNotProduction(
  env: NodeJS.ProcessEnv,
  argv: string[],
  warn: (message: string) => void = console.warn,
): void {
  if (argv.includes("--force")) {
    warn("DIQQAT: --force berilgan, prod qo'riqchisi chetlab o'tildi.\n");
    return;
  }

  const signals = productionSignals(env);
  if (signals.length === 0) return;

  throw new Error(
    [
      "Prod bazaga demo ma'lumot yozilmaydi.",
      `Sabab: ${signals.join(", ")}.`,
      "",
      "Haqiqatan shu bazaga yozmoqchi bo'lsangiz: pnpm db:seed-demo --force",
    ].join("\n"),
  );
}
