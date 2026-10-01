import { describe, expect, it, vi } from "vitest";
import {
  assertNotProduction,
  normalizeNeonHost,
  productionSignals,
} from "@/prisma/seed-guard";

/**
 * prisma/seed-guard.ts — demo seed'ning prod qo'riqchisi.
 *
 * Eng muhim test: Neon'ning pooled va pooled bo'lmagan host nomlari AYNI
 * bazani bildiradi. Konsoldan ko'chirilgan nom `DATABASE_URL` dagisi bilan
 * tashqi ko'rinishda mos kelmaydi — qo'riqchi shunda jimgina ishlamay
 * qolardi, ya'ni eng yomon nosozlik turi (bor, lekin himoya qilmaydi).
 */

const POOLED = "postgresql://u:p@ep-abc-pooler.c-5.eu-central-1.aws.neon.tech/db";
const DIRECT = "postgresql://u:p@ep-abc.c-5.eu-central-1.aws.neon.tech/db";
const PROD_HOST = "ep-abc.c-5.eu-central-1.aws.neon.tech";

/** Faqat kerakli kalitlar — `process.env` ga TEGILMAYDI. */
function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "development", ...overrides } as NodeJS.ProcessEnv;
}

describe("normalizeNeonHost", () => {
  it("-pooler qo'shimchasini olib tashlaydi", () => {
    expect(normalizeNeonHost("ep-abc-pooler.c-5.aws.neon.tech")).toBe("ep-abc.c-5.aws.neon.tech");
  });

  it("pooled bo'lmagan nomni o'zgartirmaydi", () => {
    expect(normalizeNeonHost(PROD_HOST)).toBe(PROD_HOST);
  });

  it("katta-kichik harfga sezgir emas", () => {
    expect(normalizeNeonHost("EP-ABC-POOLER.C-5.AWS.NEON.TECH")).toBe("ep-abc.c-5.aws.neon.tech");
  });

  it("host ichidagi boshqa '-pooler' so'zini buzmaydi", () => {
    // Faqat nuqtadan oldingi (yoki oxiridagi) qo'shimcha olinadi.
    expect(normalizeNeonHost("ep-pooler-test.c-5.aws.neon.tech")).toBe(
      "ep-pooler-test.c-5.aws.neon.tech",
    );
  });
});

describe("productionSignals", () => {
  it("oddiy dev muhitida bo'sh", () => {
    expect(productionSignals(env({ DATABASE_URL: POOLED }))).toEqual([]);
  });

  it("NODE_ENV=production signal beradi", () => {
    expect(productionSignals(env({ NODE_ENV: "production" }))).toContain("NODE_ENV=production");
  });

  it("VERCEL_ENV=production signal beradi", () => {
    expect(productionSignals(env({ VERCEL_ENV: "production" }))).toContain(
      "VERCEL_ENV=production",
    );
  });

  it("PROD_DATABASE_HOST yo'q bo'lsa URL tekshirilmaydi", () => {
    expect(productionSignals(env({ DATABASE_URL: POOLED, DIRECT_URL: DIRECT }))).toEqual([]);
  });

  it("konsoldan olingan (pooled bo'lmagan) host pooled URL'ga ham mos keladi", () => {
    const signals = productionSignals(
      env({ PROD_DATABASE_HOST: PROD_HOST, DATABASE_URL: POOLED }),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toContain("DATABASE_URL");
  });

  it("pooled host pooled bo'lmagan URL'ga ham mos keladi", () => {
    const signals = productionSignals(
      env({ PROD_DATABASE_HOST: "ep-abc-pooler.c-5.eu-central-1.aws.neon.tech", DIRECT_URL: DIRECT }),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toContain("DIRECT_URL");
  });

  it("ikkala URL ham prod'ga qarasa ikkita signal", () => {
    expect(
      productionSignals(
        env({ PROD_DATABASE_HOST: PROD_HOST, DATABASE_URL: POOLED, DIRECT_URL: DIRECT }),
      ),
    ).toHaveLength(2);
  });

  it("boshqa baza signal bermaydi", () => {
    expect(
      productionSignals(
        env({ PROD_DATABASE_HOST: "ep-boshqa.c-5.aws.neon.tech", DATABASE_URL: POOLED }),
      ),
    ).toEqual([]);
  });

  it("o'qib bo'lmaydigan URL JIM QOLMAYDI — u ham signal", () => {
    const signals = productionSignals(
      env({ PROD_DATABASE_HOST: PROD_HOST, DATABASE_URL: "bu-url-emas" }),
    );

    expect(signals).toEqual(["DATABASE_URL o'qib bo'lmadi"]);
  });
});

describe("assertNotProduction", () => {
  it("dev muhitida o'tkazadi", () => {
    expect(() => assertNotProduction(env({ DATABASE_URL: POOLED }), [], vi.fn())).not.toThrow();
  });

  it("prod belgisi bo'lsa throw qiladi va sababni aytadi", () => {
    expect(() => assertNotProduction(env({ NODE_ENV: "production" }), [], vi.fn())).toThrow(
      /NODE_ENV=production/,
    );
  });

  it("xato matnida --force yo'li ko'rsatiladi", () => {
    expect(() => assertNotProduction(env({ NODE_ENV: "production" }), [], vi.fn())).toThrow(
      /--force/,
    );
  });

  it("--force chetlab o'tadi va ogohlantiradi", () => {
    const warn = vi.fn();

    expect(() =>
      assertNotProduction(env({ NODE_ENV: "production" }), ["--force"], warn),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});
