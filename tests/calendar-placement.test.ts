import { describe, expect, it } from "vitest";
import {
  currentTopicIdOn,
  placeTopics,
  schoolDay,
  type PlacementInput,
  type PlacementResult,
  type PlacementTopic,
} from "@/lib/calendar/placement";

/**
 * lib/calendar/placement.ts — 07-sessiyaning asosiy testi.
 *
 * Ikki qoida tekshiriladi va ular ARALASHMASLIGI qotirib qo'yiladi:
 * `quarter` belgilangan mavzu chorak ichida TIG'IZLASHADI, belgilanmagani
 * chorak chegarasidan ERKIN oqadi.
 *
 * Sanalar `iso()` satri bilan solishtiriladi — mahalliy vaqt mintaqasidan
 * xoli, ya'ni Windows (UTC+5) va Vercel (UTC) da bir xil natija.
 */

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** 2026–2027 o'quv yili. Dars kunlari: seshanba va payshanba. */
const QUARTERS = [
  { number: 1, startsOn: d("2026-09-01"), endsOn: d("2026-10-30") },
  { number: 2, startsOn: d("2026-11-09"), endsOn: d("2026-12-25") },
  { number: 3, startsOn: d("2027-01-11"), endsOn: d("2027-03-19") },
  { number: 4, startsOn: d("2027-03-29"), endsOn: d("2027-05-25") },
];

/** 1-chorakning dars kunlari (ta'tilsiz), indeks bo'yicha. */
const Q1 = [
  "2026-09-01",
  "2026-09-03",
  "2026-09-08",
  "2026-09-10",
  "2026-09-15",
  "2026-09-17",
  "2026-09-22",
  "2026-09-24",
  "2026-09-29",
  "2026-10-01",
  "2026-10-06",
  "2026-10-08",
  "2026-10-13",
  "2026-10-15",
  "2026-10-20",
  "2026-10-22",
  "2026-10-27",
  "2026-10-29",
];

function topics(count: number, overrides: Partial<PlacementTopic> = {}): PlacementTopic[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `t${index + 1}`,
    quarter: null,
    order: index + 1,
    hoursPlan: 1,
    ...overrides,
  }));
}

function input(overrides: Partial<PlacementInput> = {}): PlacementInput {
  return {
    quarters: QUARTERS,
    holidays: [],
    topics: topics(1),
    lessonsPerWeek: 2,
    weekdays: [2, 4],
    ...overrides,
  };
}

/** Barcha slot sanalari, tartib bilan. */
function dates(result: PlacementResult): string[] {
  return result.slots.map((slot) => iso(slot.date));
}

function datesOf(result: PlacementResult, topicId: string): string[] {
  return result.slots.filter((slot) => slot.topicId === topicId).map((slot) => iso(slot.date));
}

function topicIds(result: PlacementResult): string[] {
  return result.slots.map((slot) => slot.topicId);
}

/** Sana -> o'sha kundagi mavzular soni. */
function perDay(result: PlacementResult): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of result.slots) {
    counts.set(iso(slot.date), (counts.get(iso(slot.date)) ?? 0) + 1);
  }
  return counts;
}

describe("dars kunlari oqimi", () => {
  it("hafta kunlari bo'yicha slot yaratadi", () => {
    const result = placeTopics(input());

    expect(result.slots).toHaveLength(1);
    expect(iso(result.slots[0]!.date)).toBe("2026-09-01");
    expect(result.slots[0]!.lessonIndex).toBe(0);
    expect(result.slots[0]!.topicId).toBe("t1");
    expect(result.slots[0]!.compressed).toBe(false);
  });

  it("dars kuni bo'lmagan kunga slot qo'ymaydi", () => {
    const result = placeTopics(input({ topics: topics(12) }));

    for (const slot of result.slots) {
      expect([2, 4]).toContain(slot.date.getUTCDay());
    }
  });

  it("lessonsPerWeek weekdays.length dan kichik — haftaning birinchi kunlari olinadi", () => {
    const result = placeTopics(input({ topics: topics(4), weekdays: [1, 3, 5], lessonsPerWeek: 2 }));

    expect(dates(result)).toEqual(["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09"]);
  });

  it("lessonsPerWeek weekdays.length dan katta — qo'shimcha kun o'ylab topilmaydi", () => {
    const result = placeTopics(input({ topics: topics(4), weekdays: [2], lessonsPerWeek: 3 }));

    expect(dates(result)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("bir kunga faqat bitta dars tushadi", () => {
    const result = placeTopics(input({ topics: topics(6), lessonsPerWeek: 5 }));

    expect(dates(result)).toEqual(Q1.slice(0, 6));
    expect(new Set(dates(result)).size).toBe(6);
  });

  it.each([
    ["weekdays bo'sh", { weekdays: [] }],
    ["lessonsPerWeek 0", { lessonsPerWeek: 0 }],
    ["lessonsPerWeek manfiy", { lessonsPerWeek: -2 }],
  ])("dars kuni yo'q — xato tashlamaydi, hammasi unplaced: %s", (_nom, overrides) => {
    const result = placeTopics(input({ topics: topics(3), ...overrides }));

    expect(result.slots).toEqual([]);
    expect(result.unplaced).toHaveLength(3);
    expect(result.unplaced.every((item) => item.reason === "year_end")).toBe(true);
    expect(result.currentTopicId(d("2026-10-01"))).toBeNull();
  });

  it("teskari sanali chorak e'tiborsiz qoldiriladi", () => {
    const broken = [{ number: 1, startsOn: d("2026-10-30"), endsOn: d("2026-09-01") }];
    const result = placeTopics(input({ quarters: broken, topics: topics(2) }));

    expect(result.slots).toEqual([]);
  });
});

describe("erkin oqim va ta'til (quarter: null)", () => {
  it("ta'til o'rtada — sanalar keyinga siljiydi", () => {
    const result = placeTopics(
      input({ topics: topics(8), holidays: [{ startsOn: d("2026-09-21"), endsOn: d("2026-09-25") }] }),
    );

    expect(dates(result)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
      "2026-09-15",
      "2026-09-17",
      "2026-09-29",
      "2026-10-01",
    ]);
  });

  /**
   * MUHIM: erkin oqim TIG'IZLASHMAYDI. Bayram kuniga slot qo'yilmaydi va
   * qolganlar bir dars keyinga siljiydi — soat YO'QOLMAYDI. Bu test ikki
   * qoidaning aralashmasligini qotirib qo'yadi.
   */
  it("bayram aynan dars kuniga — slot qo'yilmaydi, qolganlar siljiydi", () => {
    const result = placeTopics(
      input({ topics: topics(6), holidays: [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-15") }] }),
    );

    expect(dates(result)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
      "2026-09-17",
      "2026-09-22",
    ]);
    expect(result.slots.every((slot) => slot.compressed === false)).toBe(true);
    expect(result.unplaced).toEqual([]);
  });

  it("ta'til dam olish kuniga tushsa hech narsa o'zgarmaydi", () => {
    const base = placeTopics(input({ topics: topics(6) }));
    const withHoliday = placeTopics(
      input({ topics: topics(6), holidays: [{ startsOn: d("2026-09-05"), endsOn: d("2026-09-06") }] }),
    );

    expect(dates(withHoliday)).toEqual(dates(base));
  });

  it("choraklar orasida ta'til yozilmagan bo'lsa ham dars qo'yilmaydi", () => {
    const result = placeTopics(input({ topics: topics(19) }));

    expect(dates(result)[17]).toBe("2026-10-29");
    expect(dates(result)[18]).toBe("2026-11-10");
  });

  it("mavjud bo'lmagan chorakka ishora — erkin oqimga tushadi", () => {
    const result = placeTopics(input({ topics: topics(2, { quarter: 9 }) }));

    expect(dates(result)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(result.unplaced).toEqual([]);
  });
});

describe("tig'izlash (quarter belgilangan)", () => {
  const HOLIDAY_09_15 = [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-15") }];

  it("chorak o'rtasida 1 bayram — keyingi darsda 2 mavzu, chorak oxiri surilmaydi", () => {
    const pinned = topics(10, { quarter: 1 });
    const base = placeTopics(input({ topics: pinned }));
    const result = placeTopics(input({ topics: pinned, holidays: HOLIDAY_09_15 }));

    // Bayram kuniga tushgan t5 keyingi darsga qo'shildi, t6 o'z joyida qoldi.
    expect(datesOf(result, "t5")).toEqual(["2026-09-17"]);
    expect(datesOf(result, "t6")).toEqual(["2026-09-17"]);
    expect(perDay(result).get("2026-09-17")).toBe(2);
    expect(perDay(result).get("2026-09-15")).toBeUndefined();

    // Chorak oxiri O'ZGARMAYDI — tig'izlash siljishni yutdi.
    expect(datesOf(result, "t10")).toEqual(datesOf(base, "t10"));
    expect(result.unplaced).toEqual([]);
  });

  it("tig'izlangan kunning ikki sloti ham compressed", () => {
    const result = placeTopics(input({ topics: topics(10, { quarter: 1 }), holidays: HOLIDAY_09_15 }));
    const shared = result.slots.filter((slot) => iso(slot.date) === "2026-09-17");

    expect(shared).toHaveLength(2);
    expect(shared.every((slot) => slot.compressed)).toBe(true);
  });

  it("keyingi chorak mavzulari tegilmaydi", () => {
    const mixed = [...topics(5, { quarter: 1 }), ...topics(3, { quarter: 2 }).map((topic, index) => ({
      ...topic,
      id: `q2-${index + 1}`,
      order: 6 + index,
    }))];
    const base = placeTopics(input({ topics: mixed }));
    const result = placeTopics(input({ topics: mixed, holidays: HOLIDAY_09_15 }));

    expect(datesOf(result, "q2-1")).toEqual(datesOf(base, "q2-1"));
    expect(datesOf(result, "q2-3")).toEqual(datesOf(base, "q2-3"));
  });

  it("ketma-ket 2 bayram — ikkita dars 2 mavzuli, bittasi 3 mavzuli EMAS", () => {
    const result = placeTopics(
      input({
        topics: topics(10, { quarter: 1 }),
        holidays: [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-17") }],
      }),
    );

    const counts = [...perDay(result).values()];
    expect(Math.max(...counts)).toBe(2);
    expect(counts.filter((count) => count === 2)).toHaveLength(2);
    expect(datesOf(result, "t5")).toEqual(["2026-09-22"]);
    expect(datesOf(result, "t6")).toEqual(["2026-09-22"]);
    expect(datesOf(result, "t7")).toEqual(["2026-09-24"]);
    expect(datesOf(result, "t8")).toEqual(["2026-09-24"]);
  });

  it("bayram chorakning OXIRGI dars kuniga to'g'ri keldi — quarter_overflow", () => {
    const result = placeTopics(
      input({
        topics: topics(18, { quarter: 1 }),
        holidays: [{ startsOn: d("2026-10-29"), endsOn: d("2026-10-29") }],
      }),
    );

    expect(result.unplaced).toEqual([
      { topicId: "t18", missingHours: 1, reason: "quarter_overflow" },
    ]);
    expect(datesOf(result, "t18")).toEqual([]);
  });

  it("to'la chorak + 1 bayram: max 2 da sig'adi, max 1 da sig'maydi", () => {
    const pinned = topics(18, { quarter: 1 });
    const fits = placeTopics(input({ topics: pinned, holidays: HOLIDAY_09_15 }));
    const overflows = placeTopics(
      input({ topics: pinned, holidays: HOLIDAY_09_15, maxTopicsPerLesson: 1 }),
    );

    expect(fits.unplaced).toEqual([]);
    expect(overflows.unplaced).toEqual([
      { topicId: "t18", missingHours: 1, reason: "quarter_overflow" },
    ]);
  });

  it("bir mavzuning ikki soati bitta darsga tushmaydi", () => {
    const result = placeTopics(
      input({
        topics: [{ id: "uzun", quarter: 1, order: 1, hoursPlan: 2 }],
        holidays: [{ startsOn: d("2026-09-01"), endsOn: d("2026-09-01") }],
      }),
    );

    expect(datesOf(result, "uzun")).toEqual(["2026-09-03", "2026-09-08"]);
  });
});

describe("slot tartibi", () => {
  /**
   * A-faza (belgilangan) va B-faza (erkin) slotlarni alohida qo'shadi, ya'ni
   * xom massivda may oyidagi chorak mavzusi sentabrdagi erkin mavzudan OLDIN
   * turishi mumkin. `placeTopics` oxirida saralamasa `currentTopicIdOn`
   * noto'g'ri mavzu qaytarardi.
   */
  it("slotlar sana bo'yicha o'sib boradi", () => {
    const result = placeTopics(
      input({
        topics: [
          { id: "chorak-4", quarter: 4, order: 1, hoursPlan: 1 },
          { id: "erkin", quarter: null, order: 2, hoursPlan: 1 },
        ],
      }),
    );

    expect(topicIds(result)).toEqual(["erkin", "chorak-4"]);
    expect(dates(result)).toEqual(["2026-09-01", "2027-03-30"]);
  });

  /**
   * 1-TUZATISH TESTI: bayram t5 ni 09-17 ga surdi, u yerda allaqachon t6 bor.
   * "Hozirgi mavzu" — t6 (keyingisi), t5 emas (u allaqachon o'tilgan).
   */
  it("tig'izlangan kunda currentTopicIdOn yangi mavzuni qaytaradi", () => {
    const result = placeTopics(
      input({
        topics: topics(10, { quarter: 1 }),
        holidays: [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-15") }],
      }),
    );

    expect(result.currentTopicId(d("2026-09-17"))).toBe("t6");
  });
});

describe("soat va chorak", () => {
  it.each([
    ["null", null, 1],
    ["0", 0, 1],
    ["kasr 2.4", 2.4, 2],
  ])("hoursPlan %s — %i soat", (_nom, hoursPlan, expected) => {
    const result = placeTopics(
      input({ topics: [{ id: "t1", quarter: null, order: 1, hoursPlan }] }),
    );

    expect(result.slots).toHaveLength(expected);
  });

  it("3 soatlik mavzu, haftada 2 soat — ikki haftaga cho'ziladi", () => {
    const result = placeTopics(input({ topics: [{ id: "t1", quarter: null, order: 1, hoursPlan: 3 }] }));

    expect(dates(result)).toEqual(["2026-09-01", "2026-09-03", "2026-09-08"]);
    expect(result.slots.map((slot) => slot.lessonIndex)).toEqual([0, 1, 2]);
  });

  it("quarter bo'sh mavzular order bo'yicha ketma-ket", () => {
    const result = placeTopics(
      input({
        topics: [
          { id: "a", quarter: null, order: 3, hoursPlan: 1 },
          { id: "b", quarter: null, order: 1, hoursPlan: 1 },
          { id: "c", quarter: null, order: 2, hoursPlan: 1 },
        ],
      }),
    );

    expect(topicIds(result)).toEqual(["b", "c", "a"]);
    expect(dates(result)).toEqual(["2026-09-01", "2026-09-03", "2026-09-08"]);
  });

  it("belgilangan mavzu o'z chorogidan oldin qo'yilmaydi", () => {
    const result = placeTopics(
      input({
        topics: [
          { id: "erkin", quarter: null, order: 1, hoursPlan: 1 },
          { id: "uchinchi", quarter: 3, order: 2, hoursPlan: 1 },
        ],
      }),
    );

    expect(datesOf(result, "erkin")).toEqual(["2026-09-01"]);
    expect(datesOf(result, "uchinchi")).toEqual(["2027-01-12"]);
  });

  it("chorak qisqargan — sig'magani keyingi chorakka o'tadi (erkin oqim)", () => {
    const shortQ1 = [
      { number: 1, startsOn: d("2026-09-01"), endsOn: d("2026-09-10") },
      ...QUARTERS.slice(1),
    ];
    const result = placeTopics(input({ quarters: shortQ1, topics: topics(6) }));

    expect(dates(result)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
      "2026-11-10",
      "2026-11-12",
    ]);
  });

  it("o'quv yili oxiri — sig'magani unplaced (year_end)", () => {
    const result = placeTopics(input({ topics: topics(400) }));

    expect(iso(result.slots.at(-1)!.date)).toBe("2027-05-25");
    expect(result.slots.length).toBeLessThan(400);
    expect(result.unplaced).toHaveLength(400 - result.slots.length);
    expect(result.unplaced.every((item) => item.reason === "year_end")).toBe(true);
  });

  it("qisman sig'magan mavzu slotini saqlaydi va missingHours qaytaradi", () => {
    const total = placeTopics(input({ topics: topics(400) })).slots.length;
    const filler = topics(total - 1);
    const result = placeTopics(
      input({ topics: [...filler, { id: "oxirgi", quarter: null, order: total, hoursPlan: 3 }] }),
    );

    expect(datesOf(result, "oxirgi")).toEqual(["2027-05-25"]);
    expect(result.unplaced).toEqual([
      { topicId: "oxirgi", missingHours: 2, reason: "year_end" },
    ]);
  });
});

describe("anchor", () => {
  const TEN = topics(10);

  it("sinf 3 mavzu orqada — sanalar oldinga siljiydi", () => {
    const result = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t4", taughtOn: d("2026-09-22") } }),
    );

    expect(datesOf(result, "t4")).toEqual(["2026-09-22"]);
    expect(datesOf(result, "t5")).toEqual(["2026-09-24"]);
    expect(datesOf(result, "t1")).toEqual(["2026-09-10"]);
    expect(datesOf(result, "t10")).toEqual(["2026-10-13"]);
    expect(result.anchorApplied).toBe(true);
    expect(result.unplaced).toEqual([]);
  });

  it("anchor sanasi dars kuni bo'lmasa — undan oldingi eng yaqin dars kuni", () => {
    const onLessonDay = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t4", taughtOn: d("2026-09-22") } }),
    );
    const onWednesday = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t4", taughtOn: d("2026-09-23") } }),
    );

    expect(dates(onWednesday)).toEqual(dates(onLessonDay));
  });

  it("sinf oldinda — reja yil boshidan oldin surilmaydi", () => {
    const base = placeTopics(input({ topics: TEN }));
    const ahead = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t7", taughtOn: d("2026-09-10") } }),
    );

    expect(dates(ahead)).toEqual(dates(base));
    expect(ahead.anchorApplied).toBe(true);
  });

  it("delta 0 — anchorsiz hisob bilan bir xil", () => {
    const base = placeTopics(input({ topics: TEN }));
    const anchored = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t4", taughtOn: d("2026-09-10") } }),
    );

    expect(dates(anchored)).toEqual(dates(base));
    expect(anchored.anchorApplied).toBe(true);
  });

  it("anchor mavzusi ro'yxatda yo'q — e'tiborsiz, anchorApplied false", () => {
    const base = placeTopics(input({ topics: TEN }));
    const result = placeTopics(
      input({ topics: TEN, anchor: { topicId: "ochirilgan", taughtOn: d("2026-10-01") } }),
    );

    expect(dates(result)).toEqual(dates(base));
    expect(result.anchorApplied).toBe(false);
  });

  it("taughtOn o'quv yilidan oldin — anchor qo'llanmaydi", () => {
    const base = placeTopics(input({ topics: TEN }));
    const result = placeTopics(
      input({ topics: TEN, anchor: { topicId: "t1", taughtOn: d("2026-08-01") } }),
    );

    expect(dates(result)).toEqual(dates(base));
    expect(result.anchorApplied).toBe(false);
  });

  it("belgilangan chorakda sinf orqada — chorak ichida tig'izlashadi, chiqmaydi", () => {
    const pinned = topics(10, { quarter: 1 });
    const result = placeTopics(
      input({ topics: pinned, anchor: { topicId: "t4", taughtOn: d("2026-09-22") } }),
    );

    expect(datesOf(result, "t4")).toEqual(["2026-09-22"]);
    expect(datesOf(result, "t10")).toEqual(["2026-10-13"]);
    // Hammasi 1-chorak ichida qoldi.
    expect(dates(result).every((date) => date <= "2026-10-30")).toBe(true);
    expect(result.unplaced).toEqual([]);
  });

  /** 3-TUZATISH: siljish faqat anchor chorogiga tegishli. */
  it("anchor 1-chorakda — 2-chorak sanalari o'zgarmaydi", () => {
    const mixed = [
      ...topics(5, { quarter: 1 }),
      ...topics(3, { quarter: 2 }).map((topic, index) => ({
        ...topic,
        id: `q2-${index + 1}`,
        order: 6 + index,
      })),
    ];
    const base = placeTopics(input({ topics: mixed }));
    const result = placeTopics(
      input({ topics: mixed, anchor: { topicId: "t3", taughtOn: d("2026-09-22") } }),
    );

    expect(datesOf(result, "t3")).toEqual(["2026-09-22"]);
    for (const id of ["q2-1", "q2-2", "q2-3"]) {
      expect(datesOf(result, id)).toEqual(datesOf(base, id));
    }
  });

  it("sof funksiya — ikki chaqiruv bir xil, kirish Date lari o'zgarmaydi", () => {
    const anchor = { topicId: "t4", taughtOn: d("2026-09-22") };
    const payload = input({ topics: TEN, anchor });
    const first = placeTopics(payload);
    const second = placeTopics(payload);

    expect(dates(second)).toEqual(dates(first));
    expect(anchor.taughtOn.toISOString()).toBe("2026-09-22T00:00:00.000Z");
    expect(payload.quarters[0]!.startsOn.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("currentTopicIdOn", () => {
  const result = placeTopics(input({ topics: topics(18) }));

  it("birinchi darsdan oldin null", () => {
    expect(result.currentTopicId(d("2026-08-31"))).toBeNull();
  });

  it("dars kunida o'sha mavzuni qaytaradi", () => {
    expect(result.currentTopicId(d("2026-09-08"))).toBe("t3");
  });

  it("dam olish kunida oxirgi o'tilgan mavzuni qaytaradi", () => {
    // 2026-09-20 — yakshanba, oxirgi dars 09-17 (t6).
    expect(result.currentTopicId(d("2026-09-20"))).toBe("t6");
  });

  it("bayram kunida oxirgi o'tilgan mavzuni qaytaradi", () => {
    const withHoliday = placeTopics(
      input({ topics: topics(10), holidays: [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-15") }] }),
    );

    expect(withHoliday.currentTopicId(d("2026-09-15"))).toBe("t4");
  });

  it("choraklar orasida oldingi chorakning oxirgi mavzusini qaytaradi", () => {
    expect(result.currentTopicId(d("2026-11-05"))).toBe("t18");
  });

  it("oxirgi slotdan keyin oxirgi mavzuni qaytaradi", () => {
    expect(result.currentTopicId(d("2027-06-30"))).toBe("t18");
  });

  it("slot bo'lmasa null", () => {
    const empty = placeTopics(input({ topics: topics(3), weekdays: [] }));

    expect(empty.currentTopicId(d("2026-10-01"))).toBeNull();
  });

  it("vaqt komponenti ahamiyatsiz", () => {
    expect(currentTopicIdOn(result.slots, new Date("2026-09-08T18:30:00.000Z"))).toBe(
      currentTopicIdOn(result.slots, d("2026-09-08")),
    );
  });

  it("schoolDay Toshkent kunini beradi", () => {
    // 20:00 UTC = 01:00 Toshkent, ya'ni allaqachon keyingi kun.
    expect(iso(schoolDay(new Date("2026-09-08T20:00:00.000Z")))).toBe("2026-09-09");
    expect(iso(schoolDay(new Date("2026-09-08T18:00:00.000Z")))).toBe("2026-09-08");
  });
});
