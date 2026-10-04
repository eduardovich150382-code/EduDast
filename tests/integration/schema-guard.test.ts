import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/generated/prisma/client";
import {
  localMigrations,
  appliedMigrations,
  missingMigrations,
  schemaDriftMessage,
} from "./schema-guard";

/**
 * SXEMA DARVOZASI — integration suite'larining birinchisi bo'lib
 * yiqiladigan test.
 *
 * NEGA ALOHIDA TEST FAYLI: qorovulni faqat `beforeAll` ichiga qo'yish
 * yetarli emas. Vitest `beforeAll` yiqilganda o'sha suite'ning
 * testlarini "skipped" deb sanaydi — 12-sessiyada sarlavhada
 * "19 skipped" chiqdi va bu yashilga o'xshab ko'rindi, holbuki test
 * bazasi to'rtta migratsiyadan orqada edi. Bu yerda esa AYNAN BITTA
 * test qizil bo'ladi va xabarida nima qilish kerakligi yozilgan.
 *
 * `skipIf(!TEST_URL)` boshqa integration fayllar bilan bir xil: test
 * bazasi umuman sozlanmagan bo'lsa integratsiya qamrovi yo'q va buni
 * `tests/setup-env.ts` izohlaydi. Bu darvoza "baza bor, lekin eskirgan"
 * holatini yopadi.
 */

const TEST_URL = process.env.TEST_DATABASE_URL;

let db: PrismaClient;

describe.skipIf(!TEST_URL)("test bazasi sxemasi", () => {
  beforeAll(() => {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_URL) {
      throw new Error(
        "TEST_DATABASE_URL asosiy baza bilan bir xil. Neon'da alohida test branch oching " +
          "(.env.example dagi izohga qarang).",
      );
    }
    db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: TEST_URL }) });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("migratsiyalardan ORQADA EMAS", async () => {
    const local = localMigrations();
    const applied = await appliedMigrations(db);
    const missing = missingMigrations(local, applied);

    // Xabar `expect` ning ikkinchi argumentida: shunda yiqilganda
    // "expected [ ... ] to equal []" emas, qilinadigan ishning o'zi
    // ko'rinadi.
    expect(missing, missing.length > 0 ? schemaDriftMessage(missing) : undefined).toEqual([]);
  });

  /**
   * Darvozaning O'ZI ishlayotganini tasdiqlaydi. Usiz
   * `localMigrations()` bo'sh massiv qaytarsa (masalan yo'l buzilsa)
   * darvoza hamisha yashil bo'lib, jimgina foydasiz bo'lib qolardi —
   * 12-sessiyadagi qo'lda yozilgan ustun ro'yxati aynan shunday
   * foydasiz bo'lgan edi.
   */
  it("qorovulning o'zi: repodagi migratsiyalar topiladi va solishtirish ishlaydi", () => {
    const local = localMigrations();

    expect(local.length).toBeGreaterThan(10);
    expect(local).toContain("20261002192052_reminders");
    // Bittasi bazada yo'q bo'lsa — aniq aniqlanadi.
    expect(missingMigrations(local, local.slice(0, -1))).toEqual([local.at(-1)]);
    // Hammasi bor bo'lsa — bo'sh.
    expect(missingMigrations(local, local)).toEqual([]);
    // Bazada ortiqcha migratsiya bo'lsa YIQILMAYDI (shox almashganda normal).
    expect(missingMigrations(local, [...local, "99999999_boshqa_shoxdan"])).toEqual([]);
  });
});
