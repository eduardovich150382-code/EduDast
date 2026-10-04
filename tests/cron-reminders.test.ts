import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/reminders/route";

/**
 * `app/api/cron/reminders/route.ts`.
 *
 * ENG MUHIM TEKSHIRUV: sir sozlanmagan bo'lsa endpoint YOPIQ (503).
 * Ochiq qolgan bu endpoint — har kim HAMMA o'qituvchiga xabar
 * yuborishni qo'zg'ata olishi degani.
 *
 * DIQQAT — `GET` STATIK import qilingani route'ning `CRON_SECRET` ni
 * modul darajasida emas, `GET` ning ICHIDA o'qishiga bog'liq: agar u
 * modul darajasiga ko'chsa, `vi.stubEnv` kech qoladi va 503 testi
 * jimgina noto'g'ri narsani tekshira boshlaydi (yiqilmaydi — shuning
 * uchun xavfli). `cron-embeddings.test.ts` dagi bilan bir xil sabab.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  loadActiveYear: vi.fn(),
  loadTeacherWeek: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findMany: mocks.findMany, update: mocks.update } },
}));
vi.mock("@/lib/calendar/week-data", () => ({
  loadActiveYear: mocks.loadActiveYear,
  loadTeacherWeek: mocks.loadTeacherWeek,
}));
vi.mock("@/lib/telegram/api", () => ({ sendMessage: mocks.sendMessage }));

const SECRET = "s".repeat(64);

function request(auth?: string, query = "?tur=kunlik"): NextRequest {
  return new NextRequest(`https://edudast.uz/api/cron/reminders${query}`, {
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

const ok = (query?: string) => request(`Bearer ${SECRET}`, query);

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** 2026-10-07 chorshanba; ertaga = payshanba 10-08. */
const THURSDAY = utc("2026-10-08");

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    // `BigInt(...)` chaqiruvi, `111n` literali EMAS: tsconfig `target`
    // ES2017 va literal `tsc` ni yiqitadi (`credits-race.test.ts` da ham
    // shu sabab).
    telegramId: BigInt(111),
    locale: "uz",
    region: null,
    remindersEnabled: true,
    weeklyDigestEnabled: true,
    lastReminderAt: null,
    ...over,
  };
}

/** Ertaga bitta dars, materiali YO'Q — ya'ni kunlik eslatma tegishli. */
function weekWithTomorrowLesson() {
  return {
    anchorDay: THURSDAY,
    year: null,
    period: { quarter: 1, week: 5 },
    classes: [
      {
        row: {
          id: "c1",
          grade: 7,
          label: "A",
          lessonsPerWeek: 2,
          topicOffset: 0,
          subjectId: "s1",
          subjectSlug: "fizika",
          subjectName: "Fizika",
          weekdays: [4],
        },
        position: {
          mode: "days" as const,
          weekStart: utc("2026-10-05"),
          weekEnd: utc("2026-10-11"),
          days: [{ date: THURSDAY, weekday: 4, topicIds: ["t1"], past: false }],
          weekTopicIds: ["t1"],
          todayTopicId: null,
          tomorrowTopicId: null,
          currentTopicId: null,
          previousTopicId: null,
          nextTopicId: null,
          unplaced: [],
          anchorApplied: true,
        },
        titleById: new Map([["t1", "Tezlanish"]]),
        orderById: new Map([["t1", 1]]),
      },
    ],
    docsByTopic: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://edudast.uz");
  // Soat qotiriladi: chorshanba 14:00 UTC = 19:00 Toshkent.
  //
  // `vi.useFakeTimers()` ATAYLAB chaqirilmaydi — Vitest 5 da
  // `setSystemTime` o'zi `Date` ni mocklaydi, taymerlarga esa bu testda
  // ehtiyoj yo'q (ular mocklansa `await` lar osilib qolardi). Tasdiqlangan:
  // mock'siz `new Date()` shu qiymatni qaytaradi. Soatsiz "bugun
  // allaqachon xabar ketgan" testi jimgina noto'g'ri sababdan o'tardi.
  vi.setSystemTime(new Date("2026-10-07T14:00:00.000Z"));

  mocks.findMany.mockResolvedValue([]);
  mocks.update.mockResolvedValue({});
  mocks.loadActiveYear.mockResolvedValue(null);
  mocks.loadTeacherWeek.mockResolvedValue(weekWithTomorrowLesson());
  mocks.sendMessage.mockResolvedValue({ ok: true });
});

describe("qorovul", () => {
  it("CRON_SECRET sozlanmagan bo'lsa 503 — endpoint BUTUNLAY yopiq", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(ok());

    expect(res.status).toBe(503);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["sarlavha yo'q", undefined],
    ["bo'sh", ""],
    ["Bearer yo'q", SECRET],
    ["boshqa sir", `Bearer ${"x".repeat(64)}`],
    ["qisqa sir", "Bearer s"],
    ["uzun sir", `Bearer ${SECRET}x`],
    ["boshqa sxema", `Basic ${SECRET}`],
  ])("noto'g'ri ruxsat -> 401: %s", async (_nom, auth) => {
    const res = await GET(request(auth));

    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  /**
   * TUR QUERY'DAN, soatdan aniqlash zaxirasi YO'Q. Zaxira bo'lsa
   * konfiguratsiya xatosi jimgina yashirinardi — jadval o'zgarsa route
   * noto'g'ri turni yuborardi va buni hech kim bilmasdi.
   */
  it.each([
    ["tur yo'q", ""],
    ["bo'sh tur", "?tur="],
    ["noma'lum tur", "?tur=oylik"],
    ["boshqa harf", "?tur=Kunlik"],
    ["boshqa parametr", "?turi=kunlik"],
  ])("tur noto'g'ri -> 400: %s", async (_nom, query) => {
    const res = await GET(ok(query));

    expect(res.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("qorovul TARTIBI: sir tekshiruvi turdan OLDIN", async () => {
    // Sir noto'g'ri VA tur noto'g'ri — 401 chiqishi kerak, 400 emas,
    // aks holda ruxsatsiz odam query'ni zondlab bilib olardi.
    const res = await GET(request("Bearer xato", "?tur=oylik"));
    expect(res.status).toBe(401);
  });
});

describe("tur", () => {
  it("?tur=kunlik -> kind daily", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);

    const res = await GET(ok("?tur=kunlik"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, kind: "daily", sent: 1 });
  });

  it("?tur=haftalik -> kind weeklyDigest", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);

    const res = await GET(ok("?tur=haftalik"));

    expect(await res.json()).toMatchObject({ ok: true, kind: "weeklyDigest", sent: 1 });
  });

  it("so'rov `remindersEnabled: true` va eng eski `lastReminderAt` bo'yicha", async () => {
    await GET(ok());

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, remindersEnabled: true },
        orderBy: [{ lastReminderAt: "asc" }, { id: "asc" }],
        take: 50,
      }),
    );
  });
});

describe("yuborish natijalari", () => {
  it("muvaffaqiyat -> lastReminderAt yoziladi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ sent: 1, failed: 0, blocked: 0 });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { lastReminderAt: expect.any(Date) },
    });
  });

  /**
   * Bloklangan foydalanuvchiga xabar HECH QACHON yetmaydi, shuning uchun
   * `remindersEnabled` o'chiriladi. `lastReminderAt` esa YOZILMAYDI —
   * xabar ketmadi, ya'ni kunning sloti yeyilmasligi kerak.
   */
  it("403 -> remindersEnabled o'chiriladi, lastReminderAt YOZILMAYDI", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);
    mocks.sendMessage.mockResolvedValue({ ok: false, errorCode: 403 });

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ sent: 0, failed: 1, blocked: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { remindersEnabled: false },
    });
  });

  it("boshqa xato (429) -> ikkisi ham yozilmaydi, keyingi yugurishda qayta urinadi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);
    mocks.sendMessage.mockResolvedValue({ ok: false, errorCode: 429 });

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ sent: 0, failed: 1, blocked: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("tarmoq xatosi (errorCode yo'q) -> faqat failed", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);
    mocks.sendMessage.mockResolvedValue({ ok: false });

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ ok: true, sent: 0, failed: 1, blocked: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("bitta foydalanuvchining xatosi QOLGANLARNI to'xtatmaydi", async () => {
    mocks.findMany.mockResolvedValue([
      userRow({ id: "a", telegramId: BigInt(1) }),
      userRow({ id: "b", telegramId: BigInt(2) }),
      userRow({ id: "c", telegramId: BigInt(3) }),
    ]);
    mocks.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("tarmoq"))
      .mockResolvedValueOnce({ ok: true });

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ ok: true, planned: 3, sent: 2, failed: 1 });
  });

  it("bitta dars bo'lsa inline tugma qo'shiladi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);

    await GET(ok());

    const [, , opts] = mocks.sendMessage.mock.calls[0]!;
    expect(opts.replyMarkup).toMatchObject({
      inline_keyboard: [[{ url: expect.stringContaining("/uz/ish/yarat?fan=fizika") }]],
    });
  });

  it("chatId satr sifatida uzatiladi (BigInt emas)", async () => {
    mocks.findMany.mockResolvedValue([userRow({ telegramId: BigInt("9007199254740993") })]);

    await GET(ok());

    expect(mocks.sendMessage.mock.calls[0]![0]).toBe("9007199254740993");
  });
});

describe("darvozalar route darajasida", () => {
  it("material TAYYOR bo'lsa kunlik xabar ketmaydi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);
    const week = weekWithTomorrowLesson();
    week.docsByTopic = new Map([["t1", [{ id: "d1", type: "LESSON_PLAN" }]]]) as never;
    mocks.loadTeacherWeek.mockResolvedValue(week);

    const res = await GET(ok("?tur=kunlik"));

    expect(await res.json()).toMatchObject({ planned: 0, sent: 0 });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("bugun allaqachon xabar ketgan bo'lsa qayta ketmaydi", async () => {
    mocks.findMany.mockResolvedValue([
      userRow({ lastReminderAt: new Date("2026-10-07T13:00:00.000Z") }),
    ]);

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ candidates: 1, planned: 0, sent: 0 });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("ta'til haftasi (dars yo'q) -> xabar ketmaydi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);
    const week = weekWithTomorrowLesson();
    week.classes = [];
    week.period = null as never;
    mocks.loadTeacherWeek.mockResolvedValue(week);

    const res = await GET(ok("?tur=haftalik"));

    expect(await res.json()).toMatchObject({ planned: 0, sent: 0 });
  });

  it("weeklyDigestEnabled = false -> xulosa yo'q, kunlik bor", async () => {
    mocks.findMany.mockResolvedValue([userRow({ weeklyDigestEnabled: false })]);

    expect(await (await GET(ok("?tur=haftalik"))).json()).toMatchObject({ sent: 0 });
    expect(await (await GET(ok("?tur=kunlik"))).json()).toMatchObject({ sent: 1 });
  });
});

describe("chegara va keshlar", () => {
  it("chegaraga tegilsa ogohlantiradi — jim qolmaydi", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => userRow({ id: `u${i}`, telegramId: BigInt(i + 1) })),
    );

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ candidates: 50 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("chegara to'ldi"));
    warn.mockRestore();
  });

  it("faol yil VILOYAT bo'yicha keshlanadi — 4 foydalanuvchi, 2 viloyat, 2 so'rov", async () => {
    mocks.findMany.mockResolvedValue([
      userRow({ id: "a", telegramId: BigInt(1), region: "toshkent" }),
      userRow({ id: "b", telegramId: BigInt(2), region: "toshkent" }),
      userRow({ id: "c", telegramId: BigInt(3), region: "samarqand" }),
      userRow({ id: "d", telegramId: BigInt(4), region: "samarqand" }),
    ]);

    await GET(ok());

    expect(mocks.loadActiveYear).toHaveBeenCalledTimes(2);
  });

  it("mavzu keshi butun yugurish bo'ylab BITTA — har chaqiruvga o'sha Map uzatiladi", async () => {
    mocks.findMany.mockResolvedValue([
      userRow({ id: "a", telegramId: BigInt(1) }),
      userRow({ id: "b", telegramId: BigInt(2) }),
    ]);

    await GET(ok());

    const first = mocks.loadTeacherWeek.mock.calls[0]![1].topicCache;
    const second = mocks.loadTeacherWeek.mock.calls[1]![1].topicCache;
    expect(first).toBeInstanceOf(Map);
    expect(second).toBe(first);
  });

  it("anchor ERTANGI kun — `loadTeacherWeek` ga shu uzatiladi", async () => {
    mocks.findMany.mockResolvedValue([userRow()]);

    await GET(ok());

    const { anchorDay } = mocks.loadTeacherWeek.mock.calls[0]![1];
    expect((anchorDay as Date).toISOString()).toBe(THURSDAY.toISOString());
  });
});

describe("baza manzili sozlanmaganda", () => {
  it("ogohlantiradi, lekin xabar baribir ketadi (havolasiz)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.findMany.mockResolvedValue([userRow()]);

    const res = await GET(ok());

    expect(await res.json()).toMatchObject({ ok: true, sent: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_APP_URL"));
    expect(mocks.sendMessage.mock.calls[0]![1]).not.toContain("http");
    warn.mockRestore();
  });
});

describe("yiqilish", () => {
  /**
   * HTTP 200 — 5xx da Vercel Cron qayta uradi va yiqilgan bazaga
   * qayta-qayta uriladi. Holat javob tanasida.
   */
  it("baza yiqilsa 200 + errorKind", async () => {
    mocks.findMany.mockRejectedValue(new TypeError("ulanish yo'q"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(ok());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, errorKind: "TypeError", sent: 0 });
    error.mockRestore();
  });
});
