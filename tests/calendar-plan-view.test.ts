import { describe, expect, it } from "vitest";
import type { PlacementSlot } from "@/lib/calendar/placement";
import { buildPlanRows } from "@/lib/calendar/plan-view";

/**
 * lib/calendar/plan-view.ts — "Rejam" sahifasining ko'rinish qatorlari.
 *
 * Sahifadan ajratilgani uchun holat hisobi React render'isiz tekshiriladi.
 */

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const QUARTERS = [
  { number: 1, startsOn: d("2026-09-01"), endsOn: d("2026-10-30") },
  { number: 2, startsOn: d("2026-11-09"), endsOn: d("2026-12-25") },
];

function slot(topicId: string, date: string, overrides: Partial<PlacementSlot> = {}): PlacementSlot {
  return { topicId, date: d(date), lessonIndex: 0, compressed: false, ...overrides };
}

function rows(args: Partial<Parameters<typeof buildPlanRows>[0]> = {}) {
  return buildPlanRows({
    topics: [{ id: "t1", quarter: null }],
    slots: [slot("t1", "2026-09-01")],
    quarters: QUARTERS,
    currentTopicId: null,
    today: d("2026-09-15"),
    ...args,
  });
}

describe("chorakka guruhlash", () => {
  it("belgilanmagan mavzu sanasidan kelib chiqib chorakka tushadi", () => {
    const result = rows({ slots: [slot("t1", "2026-11-10")] });

    expect(result[0]?.quarter).toBe(2);
  });

  /** Belgilangan chorak ustun: mavzu o'sha chorakda o'tishi kafolatlangan. */
  it("belgilangan chorak sanadan ustun", () => {
    const result = rows({
      topics: [{ id: "t1", quarter: 2 }],
      slots: [slot("t1", "2026-09-01")],
    });

    expect(result[0]?.quarter).toBe(2);
  });

  it("sanasi yo'q va chorogi yo'q mavzu — quarter null", () => {
    const result = rows({ slots: [] });

    expect(result[0]?.quarter).toBeNull();
    expect(result[0]?.firstDate).toBeNull();
    expect(result[0]?.hours).toBe(0);
  });

  it("choraklar orasiga tushgan sana — quarter null", () => {
    const result = rows({ slots: [slot("t1", "2026-11-02")] });

    expect(result[0]?.quarter).toBeNull();
  });
});

describe("holat", () => {
  it("oxirgi darsi bugundan oldin — o'tilgan", () => {
    const result = rows({ slots: [slot("t1", "2026-09-01")], today: d("2026-09-15") });

    expect(result[0]?.status).toBe("done");
  });

  it("darsi kelajakda — oldinda", () => {
    const result = rows({ slots: [slot("t1", "2026-10-01")], today: d("2026-09-15") });

    expect(result[0]?.status).toBe("ahead");
  });

  it("bugun dars bo'lsa — oldinda (hali o'tilmagan)", () => {
    const result = rows({ slots: [slot("t1", "2026-09-15")], today: d("2026-09-15") });

    expect(result[0]?.status).toBe("ahead");
  });

  /**
   * Tartib MUHIM: hozirgi mavzuning birinchi soatlari allaqachon o'tilgan
   * bo'lishi mumkin (3 soatlik mavzuning 2-haftasi). "O'tilgan" deb
   * ko'rsatilsa o'qituvchi rejadan chalg'irdi.
   */
  it("currentTopicId 'o'tilgan' dan ustun", () => {
    const result = rows({
      slots: [slot("t1", "2026-09-01"), slot("t1", "2026-09-03", { lessonIndex: 1 })],
      currentTopicId: "t1",
      today: d("2026-09-15"),
    });

    expect(result[0]?.status).toBe("current");
  });

  it("sanasi yo'q mavzu — oldinda", () => {
    expect(rows({ slots: [] })[0]?.status).toBe("ahead");
  });
});

describe("soat va tig'izlash", () => {
  it("slotlar soni soat sifatida sanaladi, birinchi sana olinadi", () => {
    const result = rows({
      slots: [
        slot("t1", "2026-09-03", { lessonIndex: 1 }),
        slot("t1", "2026-09-01"),
        slot("t1", "2026-09-08", { lessonIndex: 2 }),
      ],
    });

    expect(result[0]?.hours).toBe(3);
    expect(result[0]?.firstDate?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("bitta sloti tig'izlangan bo'lsa ham mavzu compressed", () => {
    const result = rows({
      slots: [slot("t1", "2026-09-01"), slot("t1", "2026-09-03", { compressed: true })],
    });

    expect(result[0]?.compressed).toBe(true);
  });

  it("tig'izlanmagan mavzu compressed emas", () => {
    expect(rows()[0]?.compressed).toBe(false);
  });
});

describe("tartib", () => {
  it("qatorlar kirish tartibini saqlaydi (order bo'yicha yoyilgan)", () => {
    const result = buildPlanRows({
      topics: [
        { id: "a", quarter: null },
        { id: "b", quarter: null },
        { id: "c", quarter: null },
      ],
      slots: [slot("a", "2026-09-01"), slot("b", "2026-09-03"), slot("c", "2026-09-08")],
      quarters: QUARTERS,
      currentTopicId: null,
      today: d("2026-09-15"),
    });

    expect(result.map((row) => row.topicId)).toEqual(["a", "b", "c"]);
  });
});
