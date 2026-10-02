import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import uzCyrl from "@/messages/uz-Cyrl.json";
import type { AppLocale } from "@/lib/i18n/routing";
import {
  DIGEST_MAX_LESSONS,
  renderReminder,
  renderToday,
  type RenderReminderContext,
  type ReminderTranslate,
} from "@/lib/reminders/render";
import { DOC_TYPE_ORDER, type ReminderLesson, type ReminderMessage } from "@/lib/reminders/plan";

/**
 * Tarjimon HAQIQIY `messages/*.json` dan quriladi, qo'lda yozilgan
 * fiksturadan EMAS.
 *
 * NEGA SHUNDAY: `lib/reminders/render.ts` `lib/` da, `i18n-usage` skaneri
 * esa faqat `app/` va `components/` ni ko'radi. Ya'ni bu fayl eslatma
 * kalitlarining YAGONA qorovuli — kalit o'chirilsa yoki qayta nomlansa
 * faqat shu test tutadi. Aks holda o'qituvchi Telegram'da
 * "Reminders.daily.title" degan xabar olardi.
 */

const LOCALES = [
  ["uz", uz],
  ["uz-Cyrl", uzCyrl],
  ["ru", ru],
] as const;

function translatorFor(locale: AppLocale, messages: object): ReminderTranslate {
  // Nomfaza BERILMAYDI — renderer kalitlarni to'liq yo'l bilan o'qiydi.
  const translate = createTranslator({ locale, messages: messages as never });
  return (key, values) => translate(key as never, values as never) as string;
}

function contextFor(locale: AppLocale, messages: object, baseUrl: string | null = "https://edudast.uz"): RenderReminderContext {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return {
    translate: translatorFor(locale, messages),
    formatDate: (date) => format.format(date),
    baseUrl,
    locale,
  };
}

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function lesson(over: Partial<ReminderLesson> = {}): ReminderLesson {
  return {
    classId: "c1",
    topicId: "t1",
    topicTitle: "Tezlanish",
    subjectName: "Fizika",
    subjectSlug: "fizika",
    grade: 7,
    label: "A",
    weekday: 3,
    date: utc("2026-10-07"),
    quarter: 1,
    readyTypes: [],
    missingTypes: ["LESSON_PLAN"],
    ready: "none",
    ...over,
  };
}

function message(over: Partial<ReminderMessage> = {}): ReminderMessage {
  return {
    userId: "u1",
    chatId: "111",
    locale: "uz",
    kind: "weeklyDigest",
    lessons: [lesson()],
    weekStart: utc("2026-10-05"),
    weekEnd: utc("2026-10-11"),
    lessonCount: 1,
    readyCount: 0,
    ...over,
  };
}

/** Telegram `parse_mode` siz yuboradi — matnda markup bo'lmasligi SHART. */
function expectPlainText(text: string): void {
  expect(text).not.toMatch(/[*_`]/);
  expect(text).not.toContain("[");
  expect(text).not.toContain("](");
  for (const line of text.split("\n")) {
    expect(line.startsWith("#")).toBe(false);
    expect(line.startsWith("- ")).toBe(false);
  }
}

describe.each(LOCALES)("uchala tilda (%s)", (locale, messages) => {
  const context = contextFor(locale, messages);

  it("xulosa bo'sh emas va mazmunli", () => {
    const text = renderReminder(message(), context);

    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain("Tezlanish");
    expect(text).toContain("7");
    expect(text).toContain("https://edudast.uz/");
  });

  /**
   * Bu assertion `lib/` dagi kalitlarning qorovuli: kalit topilmasa
   * next-intl uning YO'LINI qaytaradi, ya'ni "Reminders.ready" matn
   * ichida paydo bo'ladi.
   */
  it("hech qanday kalit yo'li sizib chiqmaydi", () => {
    const text = renderReminder(
      message({
        lessons: [
          lesson({ readyTypes: ["LESSON_PLAN", "TEST"], missingTypes: [], ready: "full" }),
          lesson({ topicId: "t2", weekday: null, date: null }),
        ],
      }),
      context,
    );

    expect(text).not.toMatch(/Reminders\./);
    expect(text).not.toMatch(/Week\./);
  });

  it("markup belgilari yo'q (parse_mode yoqilmagan)", () => {
    expectPlainText(renderReminder(message(), context));
    expectPlainText(renderReminder(message({ kind: "daily" }), context));
  });

  it("kunlik xabar ham uchala tilda ishlaydi", () => {
    const text = renderReminder(message({ kind: "daily" }), context);
    expect(text).toContain("Tezlanish");
    expect(text).not.toMatch(/Reminders\./);
  });
});

describe("til haqiqatan farq qiladi", () => {
  it("uchala variant bir-biridan boshqa", () => {
    const texts = LOCALES.map(([locale, messages]) =>
      renderReminder(message(), contextFor(locale, messages)),
    );
    expect(new Set(texts).size).toBe(3);
  });

  it("havola o'z til prefiksi bilan", () => {
    expect(renderReminder(message(), contextFor("uz", uz))).toContain("/uz/ish/yarat");
    expect(renderReminder(message(), contextFor("ru", ru))).toContain("/ru/ish/yarat");
  });
});

describe("o'zbek apostrofi", () => {
  const context = contextFor("uz", uz);

  it("`yo'q` buzilmaydi", () => {
    const text = renderReminder(message(), context);
    expect(text).toContain("yo'q");
  });

  it("material yorlig'idagi apostrof ham butun (`Qo'llanma`)", () => {
    const text = renderReminder(
      message({
        lessons: [lesson({ readyTypes: ["GUIDE"], missingTypes: ["LESSON_PLAN"], ready: "partial" })],
      }),
      context,
    );
    expect(text).toContain("Qo'llanma");
  });
});

describe("kunlik xabar", () => {
  const context = contextFor("uz", uz);

  it("`Tayyor:` qatori UMUMAN yo'q — hammasi tayyor emas", () => {
    const text = renderReminder(
      message({ kind: "daily", lessons: [lesson(), lesson({ topicId: "t2" })] }),
      context,
    );
    expect(text).not.toContain("Tayyor:");
    expect(text).not.toContain("Hali hech narsa yo'q");
  });

  it("sarlavhadagi son `lessons.length` ga teng", () => {
    const text = renderReminder(
      message({
        kind: "daily",
        lessons: [lesson(), lesson({ topicId: "t2" })],
        // Haftaning to'liq soni boshqa — sarlavha SHUNGA qaramasligi kerak.
        lessonCount: 9,
      }),
      context,
    );
    expect(text).toContain("Ertaga 2 ta");
    expect(text).not.toContain("Ertaga 9 ta");
  });

  it("kun nomi yo'q (har doim ertaga)", () => {
    const text = renderReminder(message({ kind: "daily" }), context);
    expect(text).not.toContain("Chorshanba");
  });
});

describe("haftalik xulosa", () => {
  const context = contextFor("uz", uz);

  it("tayyor / qisman / bo'sh — uch holat ko'rinadi", () => {
    const text = renderReminder(
      message({
        lessons: [
          lesson({ topicId: "t1", readyTypes: ["LESSON_PLAN"], missingTypes: [], ready: "full" }),
          lesson({
            topicId: "t2",
            weekday: 4,
            readyTypes: ["TEST"],
            missingTypes: ["LESSON_PLAN"],
            ready: "partial",
          }),
          lesson({ topicId: "t3", weekday: 5 }),
        ],
        lessonCount: 3,
        readyCount: 1,
      }),
      context,
    );

    expect(text).toContain("Tayyor: Dars ishlanma");
    expect(text).toContain("Tayyor: Test");
    expect(text).toContain("Kerak: Dars ishlanma");
    expect(text).toContain("Hali hech narsa yo'q");
  });

  it("kun nomi va sana chiqadi", () => {
    const text = renderReminder(message(), context);
    expect(text).toContain("Chorshanba");
    expect(text).toContain("7-okt");
  });

  it("jadvalsiz dars `Bu hafta` variantini oladi, kun nomisiz", () => {
    const text = renderReminder(
      message({ lessons: [lesson({ weekday: null, date: null })] }),
      context,
    );
    expect(text).toContain("Bu hafta");
    expect(text).not.toContain("Chorshanba");
  });

  /**
   * Chegarasiz bu xabar 4096 belgidan oshardi va Telegram BUTUN xabarni
   * rad etardi — ya'ni o'qituvchi hech narsa olmasdi.
   */
  it("40 darslik xulosa Telegram chegarasiga sig'adi va `andMore` bilan tugaydi", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      lesson({ topicId: `t${i}`, topicTitle: `Mavzu ${i} — ancha uzun sarlavha bo'lsin`, weekday: (i % 6) + 1 }),
    );
    const text = renderReminder(message({ lessons: many, lessonCount: 40 }), context);

    expect(text.length).toBeLessThan(4096);
    expect(text).toContain("va yana 28 ta dars.");
    expect(text.split("\n\n")).toHaveLength(DIGEST_MAX_LESSONS + 2);
  });
});

describe("baseUrl sozlanmaganda", () => {
  const context = contextFor("uz", uz, null);

  it("`http` umuman yo'q va osilib qolgan bo'sh qator qolmaydi", () => {
    const text = renderReminder(message({ lessons: [lesson(), lesson({ topicId: "t2" })] }), context);

    expect(text).not.toContain("http");
    expect(text).not.toMatch(/\n\n\n/);
    expect(text.endsWith("\n")).toBe(false);
    // Xabar hali ham foydali.
    expect(text).toContain("Tezlanish");
  });
});

describe("renderToday (/bugun)", () => {
  const context = contextFor("uz", uz);

  it("TAYYOR darslar ham ko'rsatiladi (bu bezovta eslatma emas)", () => {
    const text = renderToday(
      [
        lesson({ readyTypes: ["LESSON_PLAN"], missingTypes: [], ready: "full" }),
        lesson({ topicId: "t2" }),
      ],
      context,
    );

    expect(text).toContain("Bugungi darslar:");
    expect(text).toContain("Tayyor: Dars ishlanma");
    expect(text).toContain("Hali hech narsa yo'q");
    expect(text).not.toMatch(/Reminders\./);
  });

  it("kun nomi yo'q — bugun bitta kun", () => {
    const text = renderToday([lesson()], context);
    expect(text).not.toContain("Chorshanba");
  });
});

/**
 * Dinamik kalitlar (`Week.materials.${type}`) ni i18n skaneri faqat
 * PREFIKS darajasida tekshiradi, ya'ni bitta enum a'zosi qayta nomlansa
 * birorta test tutmasdi. Shu sababli HAR BIR tur alohida qoplanadi.
 */
describe("material yorliqlari — har enum a'zosi", () => {
  const context = contextFor("uz", uz);

  it.each(DOC_TYPE_ORDER)("%s yorlig'i mavjud", (type) => {
    const text = renderReminder(
      message({ lessons: [lesson({ readyTypes: [type], missingTypes: [], ready: "full" })] }),
      context,
    );
    expect(text).not.toMatch(/Week\.materials/);
    expect(text).toContain("Tayyor: ");
  });
});

/** Hafta kunlari ham dinamik kalit — ettitasi ham tekshiriladi. */
describe("hafta kunlari — ettitasi ham", () => {
  const context = contextFor("uz", uz);

  it.each([1, 2, 3, 4, 5, 6, 7])("weekday %i yorlig'i mavjud", (weekday) => {
    const text = renderReminder(message({ lessons: [lesson({ weekday })] }), context);
    expect(text).not.toMatch(/Week\.weekday/);
  });
});

/**
 * QOROVULNING O'ZINI TEKSHIRISH.
 *
 * Yuqoridagi `not.toMatch(/Reminders\./)` assertion'lari faqat next-intl
 * yo'qolgan kalit uchun KALIT YO'LINI qaytargan holda ishlaydi. Agar
 * kutubxona xatti-harakati o'zgarsa (masalan bo'sh satr qaytarsa yoki
 * throw qilsa) o'sha assertion'lar JIMGINA foydasiz bo'lib qolardi va
 * biz buni faqat o'qituvchi Telegram'da "Reminders.ready" ko'rganda
 * bilardik. Shu test aynan shuni oldini oladi.
 */
describe("qorovulning o'zi ishlaydimi", () => {
  it("kalit o'chirilsa render natijasida kalit YO'LI paydo bo'ladi", () => {
    const broken = JSON.parse(JSON.stringify(uz));
    delete broken.Reminders.ready;

    const text = renderReminder(
      message({
        lessons: [lesson({ readyTypes: ["LESSON_PLAN"], missingTypes: [], ready: "full" })],
      }),
      contextFor("uz", broken),
    );

    expect(text).toMatch(/Reminders\./);
  });
});

describe("determinizm", () => {
  it("bir xil kirish -> bir xil satr", () => {
    const context = contextFor("uz", uz);
    const msg = message();
    expect(renderReminder(msg, context)).toBe(renderReminder(msg, context));
  });
});
