import { describe, expect, it } from "vitest";
import {
  positionForClass,
  teachingWeek,
  type ClassPosition,
  type PositionInput,
} from "@/lib/calendar/position";
import { type PlacementTopic } from "@/lib/calendar/placement";

/**
 * lib/calendar/position.ts — 09-sessiyaning hisob yadrosi.
 *
 * Mock YO'Q: modul sof, hamma kirish parametr bilan keladi
 * (`tests/calendar-placement.test.ts` uslubi). Sanalar `iso()` satri bilan
 * solishtiriladi — Windows (UTC+5) va Vercel (UTC) da bir xil natija.
 *
 * Asosiy ajrim: `mode: "days"` (jadval bor) va `mode: "week"` (jadval yo'q).
 * Ikkinchisida KUN darajasidagi javob ATAYLAB yopilgan — shu qoida bu yerda
 * qotirib qo'yiladi, aks holda keyinchalik "qulaylik uchun" ochib qo'yilib,
 * o'qituvchiga tasodifiy kun ko'rsatilardi.
 */

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** 2026–2027 o'quv yili (`calendar-placement.test.ts` bilan bir xil). */
const QUARTERS = [
  { number: 1, startsOn: d("2026-09-01"), endsOn: d("2026-10-30") },
  { number: 2, startsOn: d("2026-11-09"), endsOn: d("2026-12-25") },
  { number: 3, startsOn: d("2027-01-11"), endsOn: d("2027-03-19") },
  { number: 4, startsOn: d("2027-03-29"), endsOn: d("2027-05-25") },
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

/** 2026-09-01 — seshanba. Dars kunlari: seshanba (2) va payshanba (4). */
function input(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    quarters: QUARTERS,
    holidays: [],
    topics: topics(40),
    lessonsPerWeek: 2,
    weekdays: [2, 4],
    today: d("2026-09-01"),
    ...overrides,
  };
}

const position = (overrides: Partial<PositionInput> = {}) => positionForClass(input(overrides));
const dayDates = (result: ClassPosition) => result.days.map((day) => iso(day.date));

describe("jadval bor — mode: days", () => {
  it("mode 'days' bo'ladi", () => {
    expect(position().mode).toBe("days");
  });

  it("har dars kuni uchun mavzu qaytaradi", () => {
    const result = position();

    expect(dayDates(result)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(result.days.every((day) => day.topicIds.length > 0)).toBe(true);
  });

  it("dars kuni bo'lmagan kun days ga tushmaydi", () => {
    // Dushanba, chorshanba, juma, shanba, yakshanba — jadvalda yo'q.
    expect(position().days.map((day) => day.weekday)).toEqual([2, 4]);
  });

  it("weekday 1 = dushanba (ScheduleSlot bilan bir xil sanoq)", () => {
    // 2026-09-07 — dushanba.
    const result = position({ weekdays: [1], today: d("2026-09-07") });

    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.weekday).toBe(1);
    expect(iso(result.days[0]!.date)).toBe("2026-09-07");
  });

  it("bugungi mavzu — todayTopicId", () => {
    const result = position();

    expect(result.todayTopicId).toBe("t1");
  });

  it("ertangi mavzu — tomorrowTopicId", () => {
    // 2026-09-02 chorshanba, ertasi 09-03 payshanba — dars kuni.
    expect(position({ today: d("2026-09-02") }).tomorrowTopicId).toBe("t2");
  });

  it("ertangi mavzu KEYINGI ISO haftaga tushsa ham topiladi", () => {
    // 2026-09-06 — yakshanba, ertasi 09-07 dushanba, ya'ni keyingi hafta.
    const result = position({ weekdays: [1], today: d("2026-09-06") });

    // Hafta oynasida (31-avg – 06-sen) dushanba 08-31 bor, lekin ertangi kun
    // oynadan TASHQARIDA — shunda ham topilishi kerak.
    expect(result.tomorrowTopicId).not.toBeNull();
  });

  it("ertaga dars yo'q — tomorrowTopicId null", () => {
    // 2026-09-04 juma, ertasi shanba — jadvalda yo'q.
    expect(position({ today: d("2026-09-04") }).tomorrowTopicId).toBeNull();
  });

  it("bugun dars yo'q — todayTopicId null, currentTopicId bor", () => {
    // 2026-09-02 — chorshanba.
    const result = position({ today: d("2026-09-02") });

    expect(result.todayTopicId).toBeNull();
    expect(result.currentTopicId).toBe("t1");
  });

  it("o'tib ketgan kun past: true", () => {
    // Payshanba turib, o'sha haftaning seshanbasiga qaraymiz.
    const result = position({ today: d("2026-09-03") });

    expect(result.days.map((day) => [iso(day.date), day.past])).toEqual([
      ["2026-09-01", true],
      ["2026-09-03", false],
    ]);
  });

  it("tig'izlangan kunda topicIds ikkita, todayTopicId — eng katta order li", () => {
    // 09-15 bayram: unga tushgan t5 keyingi darsga (09-17) qo'shiladi va u
    // kun t5 + t6 ni ko'taradi (`calendar-placement.test.ts` bilan bir fixture).
    const result = position({
      topics: topics(10, { quarter: 1 }),
      holidays: [{ startsOn: d("2026-09-15"), endsOn: d("2026-09-15") }],
      today: d("2026-09-17"),
    });

    const shared = result.days.find((day) => iso(day.date) === "2026-09-17");
    expect(shared?.topicIds).toEqual(["t5", "t6"]);
    expect(result.todayTopicId).toBe("t6");
  });

  it("weekTopicIds haftadagi mavzularni takrorsiz beradi", () => {
    const result = position();

    expect(result.weekTopicIds).toEqual(["t1", "t2"]);
  });
});

describe("jadval yo'q — mode: week", () => {
  it("mode 'week', days bo'sh", () => {
    const result = position({ weekdays: [] });

    expect(result.mode).toBe("week");
    expect(result.days).toEqual([]);
  });

  it("todayTopicId va tomorrowTopicId null (spek 4-band)", () => {
    const result = position({ weekdays: [] });

    expect(result.todayTopicId).toBeNull();
    expect(result.tomorrowTopicId).toBeNull();
  });

  it("weekTopicIds bo'sh EMAS — lessonsPerWeek bo'yicha hisoblanadi", () => {
    const result = position({ weekdays: [] });

    expect(result.weekTopicIds).toHaveLength(2);
    expect(result.weekTopicIds).toEqual(["t1", "t2"]);
  });

  it("currentTopicId hisoblanadi (hafta darajasidagi javob ishlaydi)", () => {
    expect(position({ weekdays: [] }).currentTopicId).not.toBeNull();
  });

  it("lessonsPerWeek 1 va 3 — turli hafta mavzusi", () => {
    const one = position({ weekdays: [], lessonsPerWeek: 1 });
    const three = position({ weekdays: [], lessonsPerWeek: 3 });

    expect(one.weekTopicIds).toHaveLength(1);
    expect(three.weekTopicIds).toHaveLength(3);
  });

  it("weekdays'da faqat axlat bo'lsa week rejimga tushadi", () => {
    expect(position({ weekdays: [0, 9, 1.5, -2] }).mode).toBe("week");
  });

  it("axlat orasida bitta to'g'ri kun bo'lsa days rejimi saqlanadi", () => {
    expect(position({ weekdays: [0, 2, 99] }).mode).toBe("days");
  });
});

describe("anchor", () => {
  it("anchor yo'q — reja yil boshidan ketadi", () => {
    const result = position();

    expect(result.currentTopicId).toBe("t1");
    expect(result.anchorApplied).toBe(false);
  });

  it("anchor qo'llanganda anchorApplied true", () => {
    const result = position({
      anchor: { topicId: "t1", taughtOn: d("2026-09-15") },
      today: d("2026-09-17"),
    });

    expect(result.anchorApplied).toBe(true);
  });

  it("sinf orqada: anchor eski mavzuda — hafta ham orqaga suriladi", () => {
    // Anchor'siz 09-17 da t6 atrofida bo'lardi; t1 ni 09-15 da tugatgan sinf
    // ancha orqada.
    const behind = position({
      anchor: { topicId: "t1", taughtOn: d("2026-09-15") },
      today: d("2026-09-17"),
    });
    const onTime = position({ today: d("2026-09-17") });

    expect(behind.currentTopicId).toBe("t2");
    expect(onTime.currentTopicId).toBe("t6");
  });

  it("ro'yxatda yo'q anchor — anchorApplied false, natija buzilmaydi", () => {
    const result = position({
      anchor: { topicId: "mavjud-emas", taughtOn: d("2026-09-15") },
    });
    const withoutAnchor = position();

    expect(result.anchorApplied).toBe(false);
    expect(result.currentTopicId).toBe(withoutAnchor.currentTopicId);
  });
});

describe("ta'til haftasi", () => {
  it("butun hafta bayram — days bo'sh, weekTopicIds bo'sh", () => {
    const result = position({
      holidays: [{ startsOn: d("2026-08-31"), endsOn: d("2026-09-06") }],
    });

    expect(result.days).toEqual([]);
    expect(result.weekTopicIds).toEqual([]);
  });

  it("ta'til haftasida ham currentTopicId oxirgi o'tilganni beradi", () => {
    const result = position({
      holidays: [{ startsOn: d("2026-09-07"), endsOn: d("2026-09-13") }],
      today: d("2026-09-09"),
    });

    // Hafta ichida dars yo'q, lekin oldingi haftadan qolgan mavzu bor.
    expect(result.days).toEqual([]);
    expect(result.currentTopicId).not.toBeNull();
  });

  it("choraklar orasidagi hafta — days bo'sh", () => {
    // 1-chorak 10-30 da tugaydi, 2-chorak 11-09 da boshlanadi.
    const result = position({ today: d("2026-11-04") });

    expect(result.days).toEqual([]);
    expect(result.weekTopicIds).toEqual([]);
  });
});

describe("ikki sinf turli mavzuda", () => {
  it("bir xil kirish, turli anchor — turli currentTopicId", () => {
    const today = d("2026-09-17");
    const aheadClass = positionForClass(input({ today }));
    const behindClass = positionForClass(
      input({ today, anchor: { topicId: "t1", taughtOn: d("2026-09-15") } }),
    );

    expect(aheadClass.currentTopicId).not.toBe(behindClass.currentTopicId);
  });

  it("7-A va 7-B natijalari bir-biriga ta'sir qilmaydi", () => {
    const today = d("2026-09-17");
    const argsA = input({ today, weekdays: [2, 4] });
    const argsB = input({ today, weekdays: [1, 3], lessonsPerWeek: 3 });

    // Ketma-ket va teskari tartibda hisoblash bir xil natija berishi kerak —
    // modulda umumiy holat yo'qligining isboti.
    const firstA = positionForClass(argsA);
    const firstB = positionForClass(argsB);
    const secondB = positionForClass(argsB);
    const secondA = positionForClass(argsA);

    expect(secondA).toEqual(firstA);
    expect(secondB).toEqual(firstB);
    expect(firstA.days).not.toEqual(firstB.days);
  });
});

describe("chegaralar", () => {
  it("birinchi mavzuda previousTopicId null", () => {
    const result = position({ today: d("2026-09-01") });

    expect(result.currentTopicId).toBe("t1");
    expect(result.previousTopicId).toBeNull();
    expect(result.nextTopicId).toBe("t2");
  });

  it("oxirgi mavzuda nextTopicId null", () => {
    const result = position({ topics: topics(2), today: d("2026-09-03") });

    expect(result.currentTopicId).toBe("t2");
    expect(result.nextTopicId).toBeNull();
    expect(result.previousTopicId).toBe("t1");
  });

  it("reja boshlanmagan — currentTopicId null, nextTopicId birinchi mavzu", () => {
    // O'quv yili boshlanishidan oldin.
    const result = position({ today: d("2026-08-25") });

    expect(result.currentTopicId).toBeNull();
    expect(result.previousTopicId).toBeNull();
    expect(result.nextTopicId).toBe("t1");
  });

  it("mavzu yo'q — hammasi null, yiqilmaydi", () => {
    const result = position({ topics: [] });

    expect(result.currentTopicId).toBeNull();
    expect(result.previousTopicId).toBeNull();
    expect(result.nextTopicId).toBeNull();
    expect(result.weekTopicIds).toEqual([]);
  });
});

describe("hafta oralig'i", () => {
  it("weekStart dushanba, weekEnd yakshanba", () => {
    const result = position({ today: d("2026-09-03") });

    expect(iso(result.weekStart)).toBe("2026-08-31");
    expect(iso(result.weekEnd)).toBe("2026-09-06");
  });

  it("yakshanba kuni AYNAN o'sha haftani beradi (ISO)", () => {
    // 2026-09-06 — yakshanba, ya'ni 08-31 dan boshlangan haftaning OXIRI.
    const result = position({ today: d("2026-09-06") });

    expect(iso(result.weekStart)).toBe("2026-08-31");
    expect(iso(result.weekEnd)).toBe("2026-09-06");
  });

  it("dushanba kuni o'sha kundan boshlanadi", () => {
    const result = position({ today: d("2026-08-31") });

    expect(iso(result.weekStart)).toBe("2026-08-31");
  });

  it("weekStart/weekEnd — UTC yarim kecha", () => {
    const result = position();

    expect(result.weekStart.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(result.weekEnd.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });
});

describe("teachingWeek", () => {
  it("chorak boshlangan hafta — 1-hafta", () => {
    expect(teachingWeek(QUARTERS, d("2026-09-01"))).toEqual({ quarter: 1, week: 1 });
  });

  it("keyingi dushanba — 2-hafta", () => {
    expect(teachingWeek(QUARTERS, d("2026-09-07"))).toEqual({ quarter: 1, week: 2 });
  });

  it("chorak raqami to'g'ri aniqlanadi", () => {
    expect(teachingWeek(QUARTERS, d("2026-11-09"))).toEqual({ quarter: 2, week: 1 });
  });

  it("choraklar orasida null", () => {
    expect(teachingWeek(QUARTERS, d("2026-11-04"))).toBeNull();
  });

  it("yozda null", () => {
    expect(teachingWeek(QUARTERS, d("2027-07-01"))).toBeNull();
  });
});

describe("sof modul", () => {
  it("bir xil kirishda bir xil natija (soatga qaramaydi)", () => {
    const args = input();

    expect(positionForClass(args)).toEqual(positionForClass(args));
  });

  it("kirish Date lari o'zgartirilmaydi", () => {
    const today = d("2026-09-01");
    const args = input({ today });

    positionForClass(args);

    expect(iso(today)).toBe("2026-09-01");
    expect(iso(args.quarters[0]!.startsOn)).toBe("2026-09-01");
  });

  it("unplaced placeTopics dan o'tkaziladi", () => {
    // 1-chorakka sig'maydigan mavzu soni — tig'izlash bilan ham joy yetmaydi.
    const result = position({ topics: topics(80, { quarter: 1 }) });

    expect(result.unplaced.length).toBeGreaterThan(0);
  });
});
