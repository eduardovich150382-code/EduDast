import { describe, expect, it } from "vitest";
import { isTopicStale, topicEmbeddingText } from "@/lib/curriculum/embed";

/**
 * Eskirish sharti (`lib/curriculum/embed.ts`).
 *
 * NEGA SOF FUNKSIYA TESTLANADI: bir xil shart IKKI tilda yozilgan — bu
 * yerda TypeScript'da, `findStaleTopics()` da SQL'da. Siljish xavfi bor,
 * shuning uchun sof funksiya SPETSIFIKATSIYA rolini o'ynaydi va
 * `tests/integration/embeddings-write.test.ts` ikkalasini haqiqiy
 * qatorlarda solishtiradi.
 *
 * Shart nima uchun kerak: eskirgan vektor XATO BERMAYDI. Qidiruv sog'lom
 * ko'rinib, jimgina eski matnga javob qaytaradi — eng yomon nosozlik turi.
 */

const MODEL = "gemini-embedding-001";

const T0 = new Date("2026-09-20T10:00:00.000Z");
const T1 = new Date("2026-09-21T10:00:00.000Z");

describe("isTopicStale", () => {
  it("eskirmagan: model bir xil va vektor tahrirdan KEYIN yozilgan", () => {
    expect(
      isTopicStale({ embeddedAt: T1, embeddingModel: MODEL, updatedAt: T0 }, MODEL),
    ).toBe(false);
  });

  it("eskirgan: hali yozilmagan (embeddedAt IS NULL) — navbatning o'zi shu", () => {
    expect(
      isTopicStale({ embeddedAt: null, embeddingModel: null, updatedAt: T0 }, MODEL),
    ).toBe(true);
  });

  it("eskirgan: boshqa model bilan yozilgan", () => {
    expect(
      isTopicStale({ embeddedAt: T1, embeddingModel: "gemini-embedding-2", updatedAt: T0 }, MODEL),
    ).toBe(true);
  });

  it("eskirgan: vektor bor, lekin model ustuni bo'sh (yarim yozilgan qator)", () => {
    expect(
      isTopicStale({ embeddedAt: T1, embeddingModel: null, updatedAt: T0 }, MODEL),
    ).toBe(true);
  });

  it("eskirgan: matn vektordan KEYIN tahrirlangan (embeddedAt < updatedAt)", () => {
    expect(
      isTopicStale({ embeddedAt: T0, embeddingModel: MODEL, updatedAt: T1 }, MODEL),
    ).toBe(true);
  });

  /**
   * Chegara holati: bir xil payt eskirgan HISOBLANMAYDI (`<`, `<=` emas).
   * SQL tomonida ham aynan `<` — ikkalasi mos bo'lishi kerak. `<=` bo'lsa
   * `updatedAt` va `embeddedAt` bitta tranzaksiyada teng chiqib qolgan
   * qator har cron'da qayta yozilib, cheksiz pul sarflardi.
   */
  it("teng payt eskirgan emas", () => {
    const same = new Date("2026-09-21T10:00:00.000Z");
    expect(
      isTopicStale({ embeddedAt: same, embeddingModel: MODEL, updatedAt: same }, MODEL),
    ).toBe(false);
  });

  it("millisekund farqi ham sezadi", () => {
    const before = new Date("2026-09-21T10:00:00.000Z");
    const after = new Date("2026-09-21T10:00:00.001Z");
    expect(
      isTopicStale({ embeddedAt: before, embeddingModel: MODEL, updatedAt: after }, MODEL),
    ).toBe(true);
  });
});

describe("topicEmbeddingText", () => {
  it("titleUz, maqsadlar va kalit so'zlarni birlashtiradi", () => {
    const text = topicEmbeddingText({
      titleUz: "Mexanik harakat",
      objectives: ["Tezlikni hisoblash", "Birliklarni almashtirish"],
      keywords: ["harakat", "tezlik"],
    });

    expect(text).toBe(
      "Mexanik harakat\nTezlikni hisoblash\nBirliklarni almashtirish\nharakat, tezlik",
    );
  });

  it("bo'sh massivlarda ham matn yasaydi (yiqilmaydi)", () => {
    expect(topicEmbeddingText({ titleUz: "Sarlavha", objectives: [], keywords: [] })).toBe(
      "Sarlavha\n\n",
    );
  });

  /**
   * Format o'zgarsa bu test yiqiladi — ATAYLAB. Matn formati o'zgarishi
   * barcha vektorni eskiradi, lekin `embeddingModel` o'zgarmagani uchun
   * eskirish sharti buni SEZMAYDI: `--force` bilan qayta yozish kerak.
   */
  it("format qadalgan: sarlavha birinchi qatorda", () => {
    const text = topicEmbeddingText({
      titleUz: "Sarlavha",
      objectives: ["A"],
      keywords: ["b"],
    });

    expect(text.split("\n")[0]).toBe("Sarlavha");
  });
});
