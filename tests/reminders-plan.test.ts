import { describe, expect, it } from "vitest";
import { dayToDate, dayNumber } from "@/lib/calendar/placement";
import {
  anchorDayFor,
  planReminders,
  readyStateFor,
  summarizeWeek,
  type ClassWeekInput,
  type ReminderDocType,
  type ReminderUser,
  type WeekSummary,
} from "@/lib/reminders/plan";

/**
 * `lib/reminders/plan.ts` — SOF modul: bazaga bormaydi, argumentsiz
 * `new Date()` chaqirmaydi. Shu sababli bu yerda mock yo'q, faqat
 * fiksturalar.
 *
 * Sanalar UTC yarim kecha shartnomasida (`placement.ts`).
 */

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// 2026-10-05 — DUSHANBA. Butun fikstura shu haftaga qurilgan.
const MONDAY = utc("2026-10-05");
const WEDNESDAY = utc("2026-10-07");
const THURSDAY = utc("2026-10-08");
const SUNDAY = utc("2026-10-11");

function classInput(over: Partial<ClassWeekInput> = {}): ClassWeekInput {
  return {
    classId: "c1",
    grade: 7,
    label: "A",
    subjectName: "Fizika",
    subjectSlug: "fizika",
    position: {
      mode: "days",
      weekStart: MONDAY,
      weekEnd: SUNDAY,
      days: [{ date: WEDNESDAY, weekday: 3, topicIds: ["t1"], past: false }],
      weekTopicIds: ["t1"],
    },
    topicTitleById: new Map([
      ["t1", "Tezlanish"],
      ["t2", "Nyuton qonunlari"],
      ["t3", "Ishqalanish"],
    ]),
    ...over,
  };
}

function docs(
  entries: Record<string, ReminderDocType[]>,
): Map<string, { type: string }[]> {
  return new Map(
    Object.entries(entries).map(([topicId, types]) => [
      topicId,
      types.map((type) => ({ type })),
    ]),
  );
}

function summarize(over: Partial<Parameters<typeof summarizeWeek>[0]> = {}): WeekSummary {
  return summarizeWeek({
    anchorDay: WEDNESDAY,
    inTeachingPeriod: true,
    quarter: 1,
    classes: [classInput()],
    docsByTopic: new Map(),
    ...over,
  });
}

describe("readyStateFor", () => {
  it("hech narsa yo'q -> none", () => {
    expect(readyStateFor([])).toBe("none");
  });

  it("talab qilinganlarning hammasi bor -> full", () => {
    expect(readyStateFor(["LESSON_PLAN"])).toBe("full");
    expect(readyStateFor(["LESSON_PLAN", "TEST"])).toBe("full");
  });

  it("biror narsa bor, lekin talab bajarilmagan -> partial", () => {
    expect(readyStateFor(["TEST"])).toBe("partial");
    expect(readyStateFor(["TEST", "SLIDES"], ["LESSON_PLAN", "TEST"])).toBe("partial");
  });
});

describe("summarizeWeek", () => {
  it("tig'izlangan kun: dars soni KUN soniga teng emas", () => {
    const week = summarize({
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            // Bitta kunda ikki mavzu — `placement.ts` tig'izlashtirgan.
            days: [{ date: WEDNESDAY, weekday: 3, topicIds: ["t1", "t2"], past: false }],
            weekTopicIds: ["t1", "t2"],
          },
        }),
      ],
    });

    expect(week.lessonCount).toBe(2);
    expect(week.lessons.map((lesson) => lesson.topicId)).toEqual(["t1", "t2"]);
  });

  it("saralash: kun -> sinf -> harf, jadvalsizlar oxirida", () => {
    const week = summarize({
      classes: [
        classInput({
          classId: "c-9b",
          grade: 9,
          label: "B",
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [{ date: THURSDAY, weekday: 4, topicIds: ["t2"], past: false }],
            weekTopicIds: ["t2"],
          },
        }),
        classInput({
          classId: "c-7a",
          grade: 7,
          label: "A",
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [{ date: WEDNESDAY, weekday: 3, topicIds: ["t1"], past: false }],
            weekTopicIds: ["t1"],
          },
        }),
        classInput({
          classId: "c-jadvalsiz",
          grade: 8,
          label: "",
          position: {
            mode: "week",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [],
            weekTopicIds: ["t3"],
          },
        }),
      ],
    });

    expect(week.lessons.map((lesson) => lesson.classId)).toEqual([
      "c-7a",
      "c-9b",
      "c-jadvalsiz",
    ]);
  });

  it("readyCount faqat `full` larni sanaydi", () => {
    const week = summarize({
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [
              { date: WEDNESDAY, weekday: 3, topicIds: ["t1"], past: false },
              { date: THURSDAY, weekday: 4, topicIds: ["t2"], past: false },
            ],
            weekTopicIds: ["t1", "t2"],
          },
        }),
      ],
      docsByTopic: docs({ t1: ["LESSON_PLAN"], t2: ["TEST"] }),
    });

    expect(week.lessonCount).toBe(2);
    expect(week.readyCount).toBe(1);
  });

  it("faqat TEST bo'lgan mavzu -> partial, LESSON_PLAN yetishmaydi", () => {
    const week = summarize({ docsByTopic: docs({ t1: ["TEST"] }) });
    const lesson = week.lessons[0]!;

    expect(lesson.ready).toBe("partial");
    expect(lesson.readyTypes).toEqual(["TEST"]);
    expect(lesson.missingTypes).toEqual(["LESSON_PLAN"]);
  });

  /**
   * Siyosat tugmasi KONSTANTANI QOTIRMASDAN qadaladi: `FULLY_READY_TYPES`
   * mahsulot qarori va o'zgarishi mumkin, lekin "override ishlaydi"
   * fakti o'zgarmasligi kerak.
   */
  it("requiredTypes override AYNI fiksturani full dan partial ga o'giradi", () => {
    const given = { docsByTopic: docs({ t1: ["LESSON_PLAN"] }) };

    expect(summarize(given).lessons[0]!.ready).toBe("full");
    expect(
      summarize({ ...given, requiredTypes: ["LESSON_PLAN", "TEST"] }).lessons[0]!.ready,
    ).toBe("partial");
  });

  it("readyTypes hamisha DOC_TYPE_ORDER tartibida", () => {
    const week = summarize({
      docsByTopic: docs({ t1: ["GUIDE", "TEST", "LESSON_PLAN"] }),
    });
    expect(week.lessons[0]!.readyTypes).toEqual(["LESSON_PLAN", "TEST", "GUIDE"]);
  });

  it("noma'lum hujjat turi e'tiborga olinmaydi", () => {
    const week = summarizeWeek({
      anchorDay: WEDNESDAY,
      inTeachingPeriod: true,
      quarter: 1,
      classes: [classInput()],
      docsByTopic: new Map([["t1", [{ type: "ESKI_TUR" }]]]),
    });
    expect(week.lessons[0]!.readyTypes).toEqual([]);
    expect(week.lessons[0]!.ready).toBe("none");
  });

  it("mode: week -> weekday va date `null`", () => {
    const week = summarize({
      classes: [
        classInput({
          position: {
            mode: "week",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [],
            weekTopicIds: ["t1"],
          },
        }),
      ],
    });

    expect(week.lessons).toHaveLength(1);
    expect(week.lessons[0]!.weekday).toBeNull();
    expect(week.lessons[0]!.date).toBeNull();
  });

  it("sinfsiz: oyna `anchorDay` dan quriladi, darslar bo'sh", () => {
    const week = summarize({ classes: [], inTeachingPeriod: false, quarter: null });

    expect(week.lessons).toEqual([]);
    expect(week.lessonCount).toBe(0);
    expect(week.readyCount).toBe(0);
    // Chorshanba -> o'sha haftaning dushanbasi va yakshanbasi.
    expect(week.weekStart.toISOString()).toBe(MONDAY.toISOString());
    expect(week.weekEnd.toISOString()).toBe(SUNDAY.toISOString());
  });

  it("inTeachingPeriod faqat YORLIQ sifatida o'tadi", () => {
    expect(summarize({ inTeachingPeriod: false }).inTeachingPeriod).toBe(false);
    // Lekin darslar baribir bor — darvoza bu emas (planReminders testiga qara).
    expect(summarize({ inTeachingPeriod: false }).lessonCount).toBe(1);
  });
});

describe("anchorDayFor", () => {
  /**
   * BU REGRESSIYA QOROVULI: `positionForClass` oynasini dushanbadan
   * quradi, yakshanba esa ISO 7 — ya'ni `schoolDay(yakshanba)` TUGAYOTGAN
   * haftani beradi va yakshanba 18:00 dagi xulosa o'tgan haftani
   * ko'rsatardi.
   */
  it("yakshanba kechqurun -> KEYINGI dushanba", () => {
    // 2026-10-11 yakshanba, 13:00 UTC = 18:00 Toshkent.
    const anchor = anchorDayFor(new Date("2026-10-11T13:00:00.000Z"));
    expect(anchor.toISOString()).toBe(utc("2026-10-12").toISOString());
  });

  it("chorshanba kechqurun -> payshanba, oyna o'zgarmaydi", () => {
    // 2026-10-07 chorshanba, 14:00 UTC = 19:00 Toshkent.
    const anchor = anchorDayFor(new Date("2026-10-07T14:00:00.000Z"));
    expect(anchor.toISOString()).toBe(THURSDAY.toISOString());
  });

  it("Toshkent kuni hisobga olinadi: 20:00 UTC allaqachon ertasi kun", () => {
    // 2026-10-07 20:00 UTC = 2026-10-08 01:00 Toshkent -> ertasi = 10-09.
    const anchor = anchorDayFor(new Date("2026-10-07T20:00:00.000Z"));
    expect(anchor.toISOString()).toBe(utc("2026-10-09").toISOString());
  });
});

describe("planReminders — darvozalar", () => {
  // Chorshanba 14:00 UTC = 19:00 Toshkent. Ertaga = payshanba.
  const NOW = new Date("2026-10-07T14:00:00.000Z");

  function user(over: Partial<ReminderUser> = {}): ReminderUser {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [{ date: THURSDAY, weekday: 4, topicIds: ["t1"], past: false }],
            weekTopicIds: ["t1"],
          },
        }),
      ],
      docsByTopic: new Map(),
    });

    return {
      userId: "u1",
      chatId: "111",
      locale: "uz",
      remindersEnabled: true,
      weeklyDigestEnabled: true,
      lastReminderAt: null,
      week,
      ...over,
    };
  }

  it("oddiy holat: kunlik xabar ketadi", () => {
    const out = planReminders({ kind: "daily", now: NOW, users: [user()] });
    expect(out).toHaveLength(1);
    expect(out[0]!.lessons.map((l) => l.topicId)).toEqual(["t1"]);
    expect(out[0]!.chatId).toBe("111");
  });

  it("TA'TIL HAFTASI: dars yo'q -> ikkala tur ham bo'sh", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: false,
      quarter: null,
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [],
            weekTopicIds: [],
          },
        }),
      ],
      docsByTopic: new Map(),
    });
    const users = [user({ week })];

    expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    expect(planReminders({ kind: "weeklyDigest", now: NOW, users })).toEqual([]);
  });

  it("MATERIAL TO'LIQ TAYYOR: kunlik yo'q, xulosa esa uni tayyor deb ko'rsatadi", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [{ date: THURSDAY, weekday: 4, topicIds: ["t1"], past: false }],
            weekTopicIds: ["t1"],
          },
        }),
      ],
      docsByTopic: docs({ t1: ["LESSON_PLAN"] }),
    });
    const users = [user({ week })];

    expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);

    const digest = planReminders({ kind: "weeklyDigest", now: NOW, users });
    expect(digest).toHaveLength(1);
    expect(digest[0]!.lessons[0]!.ready).toBe("full");
    expect(digest[0]!.readyCount).toBe(1);
  });

  /**
   * Digest darvozasi `else` bo'lib yozilib qolishidan himoya: eslatmani
   * BUTUNLAY o'chirgan odam yakshanba xulosasini olib qolmasligi kerak.
   */
  it("remindersEnabled = false -> kunlik VA xulosa, ikkisi ham bo'sh", () => {
    const users = [user({ remindersEnabled: false })];
    expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    expect(planReminders({ kind: "weeklyDigest", now: NOW, users })).toEqual([]);
  });

  it("weeklyDigestEnabled = false -> xulosa yo'q, kunlik bor", () => {
    const users = [user({ weeklyDigestEnabled: false })];
    expect(planReminders({ kind: "weeklyDigest", now: NOW, users })).toEqual([]);
    expect(planReminders({ kind: "daily", now: NOW, users })).toHaveLength(1);
  });

  describe("bir kunda bitta xabar", () => {
    it("bugun allaqachon yuborilgan -> bo'sh", () => {
      const users = [user({ lastReminderAt: new Date("2026-10-07T13:00:00.000Z") })];
      expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    });

    /**
     * SODDA UTC SOLISHTIRISH AYNAN SHUNI XATO QILADI: 2026-10-06 23:00 UTC
     * — Toshkentda allaqachon 2026-10-07 04:00, ya'ni `now` bilan BIR XIL
     * kun. UTC kunlari esa boshqa-boshqa (06 va 07).
     */
    it("kecha 23:00 UTC = bugun 04:00 Toshkent -> baribir bo'sh", () => {
      const users = [user({ lastReminderAt: new Date("2026-10-06T23:00:00.000Z") })];
      expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    });

    it("ikki kun oldin -> xabar ketadi", () => {
      const users = [user({ lastReminderAt: new Date("2026-10-05T14:00:00.000Z") })];
      expect(planReminders({ kind: "daily", now: NOW, users })).toHaveLength(1);
    });
  });

  it("JADVALSIZ o'qituvchi: kunlik yo'q (ertaga bilinmaydi), xulosa bor", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [
        classInput({
          position: {
            mode: "week",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [],
            weekTopicIds: ["t1"],
          },
        }),
      ],
      docsByTopic: new Map(),
    });
    const users = [user({ week })];

    expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    expect(planReminders({ kind: "weeklyDigest", now: NOW, users })).toHaveLength(1);
  });

  it("SINFSIZ o'qituvchi -> ikkisi ham bo'sh", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [],
      docsByTopic: new Map(),
    });
    const users = [user({ week })];

    expect(planReminders({ kind: "daily", now: NOW, users })).toEqual([]);
    expect(planReminders({ kind: "weeklyDigest", now: NOW, users })).toEqual([]);
  });

  it("kunlik: tig'izlangan ertangi kunning IKKI mavzusi ham kiradi, bugun va indini esa yo'q", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [
              // Bugun (chorshanba) — kunlik eslatmaga tushmasligi kerak.
              { date: WEDNESDAY, weekday: 3, topicIds: ["t3"], past: false },
              // Ertaga (payshanba), tig'izlangan: ikki mavzu.
              { date: THURSDAY, weekday: 4, topicIds: ["t1", "t2"], past: false },
              // Indinga (juma) — ham tushmasligi kerak.
              { date: utc("2026-10-09"), weekday: 5, topicIds: ["t3"], past: false },
            ],
            weekTopicIds: ["t1", "t2", "t3"],
          },
        }),
      ],
      docsByTopic: new Map(),
    });

    const out = planReminders({ kind: "daily", now: NOW, users: [user({ week })] });
    expect(out).toHaveLength(1);
    expect(out[0]!.lessons.map((l) => l.topicId)).toEqual(["t1", "t2"]);
  });

  it("xulosa haftaning TO'LIQ sonini olib yuradi, filtrlangan emas", () => {
    const week = summarizeWeek({
      anchorDay: anchorDayFor(NOW),
      inTeachingPeriod: true,
      quarter: 1,
      classes: [
        classInput({
          position: {
            mode: "days",
            weekStart: MONDAY,
            weekEnd: SUNDAY,
            days: [
              { date: WEDNESDAY, weekday: 3, topicIds: ["t1"], past: false },
              { date: THURSDAY, weekday: 4, topicIds: ["t2"], past: false },
            ],
            weekTopicIds: ["t1", "t2"],
          },
        }),
      ],
      docsByTopic: docs({ t1: ["LESSON_PLAN"] }),
    });

    const out = planReminders({ kind: "weeklyDigest", now: NOW, users: [user({ week })] });
    expect(out[0]!.lessonCount).toBe(2);
    expect(out[0]!.readyCount).toBe(1);
    expect(out[0]!.lessons).toHaveLength(2);
  });

  it("ko'p foydalanuvchi: o'rtadagisi o'chirilgan -> 2 xabar, chatId va locale to'g'ri", () => {
    const out = planReminders({
      kind: "daily",
      now: NOW,
      users: [
        user({ userId: "a", chatId: "1", locale: "uz" }),
        user({ userId: "b", chatId: "2", remindersEnabled: false }),
        user({ userId: "c", chatId: "3", locale: "ru" }),
      ],
    });

    expect(out.map((m) => m.userId)).toEqual(["a", "c"]);
    expect(out.map((m) => m.chatId)).toEqual(["1", "3"]);
    expect(out.map((m) => m.locale)).toEqual(["uz", "ru"]);
  });
});

describe("soflik", () => {
  it("bir xil kirish -> bir xil natija (soatga qaramaydi)", () => {
    const NOW = new Date("2026-10-07T14:00:00.000Z");
    const input = {
      kind: "daily" as const,
      now: NOW,
      users: [
        {
          userId: "u1",
          chatId: "1",
          locale: "uz" as const,
          remindersEnabled: true,
          weeklyDigestEnabled: true,
          lastReminderAt: null,
          week: summarizeWeek({
            anchorDay: anchorDayFor(NOW),
            inTeachingPeriod: true,
            quarter: 1,
            classes: [
              classInput({
                position: {
                  mode: "days",
                  weekStart: MONDAY,
                  weekEnd: SUNDAY,
                  days: [{ date: THURSDAY, weekday: 4, topicIds: ["t1"], past: false }],
                  weekTopicIds: ["t1"],
                },
              }),
            ],
            docsByTopic: new Map(),
          }),
        },
      ],
    };

    expect(planReminders(input)).toEqual(planReminders(input));
  });

  it("kun matematikasi placement.ts dan — takrorlanmagan", () => {
    // `anchorDayFor` natijasi `dayToDate(dayNumber(...) + 1)` ga teng.
    const now = new Date("2026-10-07T14:00:00.000Z");
    expect(anchorDayFor(now).toISOString()).toBe(
      dayToDate(dayNumber(utc("2026-10-07")) + 1).toISOString(),
    );
  });
});
