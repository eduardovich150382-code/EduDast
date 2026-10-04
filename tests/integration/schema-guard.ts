import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Test bazasi `prisma/migrations/` dan orqada emasligini tekshiradi.
 *
 * MUAMMO NIMA EDI (12-sessiya): `User` ga uch ustun qo'shilgandan keyin
 * integration testlar `The column remindersEnabled does not exist` bilan
 * yiqildi, chunki test bazasi (`TEST_DATABASE_URL`) alohida Neon branch
 * va u migratsiyalarni O'ZI olmaydi. Bundan ham yomoni: `beforeAll`
 * yiqilganda vitest o'sha suite'ning testlarini "skipped" deb sanaydi,
 * ya'ni sarlavhada "19 skipped" chiqadi va bu yashilga o'xshab ko'rinadi.
 * Aslida test bazasi TO'RTTA migratsiyadan orqada edi va buni hech narsa
 * aytmagan.
 *
 * NEGA USTUN RO'YXATI EMAS: ilgari `credits-race.test.ts` da qo'lda
 * yozilgan ustun ro'yxati bor edi (`creditsHeld`, `startedAt`,
 * `failReason`, `creditsHeldFor`). U o'z paytida ishlagan, lekin keyingi
 * migratsiyani KO'RMAYDI — qorovul faqat o'zi yozilgan kundagi sxemani
 * biladi va har yangi ustunda qo'lda yangilanishi kerak bo'ladi (va
 * aynan shu unutildi). Migratsiya nomlari bo'yicha solishtirish esa
 * HAR kelgusi migratsiyani avtomatik qamraydi.
 *
 * Yo'nalish ATAYLAB bitta: "repoda bor, bazada yo'q" — xato. Teskarisi
 * ("bazada bor, repoda yo'q") tekshirilmaydi, chunki u shox almashganda
 * normal holat va unda yiqilish ishni to'xtatardi.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type MigrationRow = { migration_name: string };

/** Ishlatiladigan minimal klient yuzasi — `PrismaClient` turiga bog'lanmaydi. */
type RawQueryClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/** `prisma/migrations/` dagi migratsiya papkalari, nomi bo'yicha saralangan. */
export function localMigrations(): string[] {
  return readdirSync(join(root, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Bazaga TO'LIQ qo'llangan migratsiyalar.
 *
 * `finished_at IS NOT NULL` — yarim qolgan migratsiya qo'llangan
 * hisoblanmaydi; `rolled_back_at IS NULL` — qaytarilgani ham.
 */
export async function appliedMigrations(db: RawQueryClient): Promise<string[]> {
  const rows = await db.$queryRaw<MigrationRow[]>`
    SELECT "migration_name"::text FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
  `;
  return rows.map((row) => row.migration_name).sort();
}

/** Repoda bor, lekin bazaga qo'llanmagan migratsiyalar. */
export function missingMigrations(local: string[], applied: string[]): string[] {
  const have = new Set(applied);
  return local.filter((name) => !have.has(name));
}

export function schemaDriftMessage(missing: string[]): string {
  return (
    `Test bazasi ${missing.length} ta migratsiyadan ORQADA:\n` +
    missing.map((name) => `  - ${name}`).join("\n") +
    `\n\nQo'llash (test branch'ga, PROD'ga EMAS):\n` +
    `  DIRECT_URL="$TEST_DATABASE_URL" npx prisma migrate deploy\n\n` +
    `\`migrate dev\` ISHLATMA — u drift ko'rsa reset so'rashi mumkin.`
  );
}

/**
 * Sxema eskirgan bo'lsa ANIQ xabar bilan throw qiladi.
 *
 * Integration suite'larining `beforeAll` ida BIRINCHI chaqiriladi, shunda
 * yiqilish sababi "column does not exist" kabi tushunarsiz Prisma xatosi
 * emas, to'g'ridan-to'g'ri "baza N migratsiyadan orqada + mana buyruq"
 * bo'ladi. `schema-guard.test.ts` esa shu holatni ALOHIDA test sifatida
 * qizil qiladi, ya'ni u "skipped" ichida yashirinib qolmaydi.
 */
export async function assertTestSchemaCurrent(db: RawQueryClient): Promise<void> {
  const missing = missingMigrations(localMigrations(), await appliedMigrations(db));
  if (missing.length > 0) throw new Error(schemaDriftMessage(missing));
}
