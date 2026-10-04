import { lessonUrl } from "@/lib/reminders/link";
import type { AppLocale } from "@/lib/i18n/routing";
import type { ReminderLesson, ReminderMessage } from "@/lib/reminders/plan";

/**
 * Eslatma matni — SOF modul (docs/sessions/12-eslatmalar.md, 3-band).
 *
 * SOF MATN, `parse_mode` YO'Q. `lib/telegram/api.ts` parse rejimini
 * ataylab yoqmaydi, chunki o'zbek apostroflari (`yo'q`, `Qo'llanma`) va
 * `<` belgisi Markdown/HTML'ni buzardi yoki inyeksiya nuqtasi bo'lardi.
 * Shu sababli bu modul `*`, `_`, backtick, `[` ishlatmaydi va hech bir
 * qatorni `#` yoki `- ` bilan boshlamaydi: ular yoqilib qolsa matn
 * jimgina buzilardi. Punkt uchun `•`, ajratgich uchun ` — `.
 *
 * TARJIMA INJEKSIYA QILINADI (`translate`), modul ichida
 * `getTranslations` chaqirilmaydi: u so'rov scope'ini talab qiladi,
 * vitest `environment: node` da esa scope yo'q. Shu qaror tufayli
 * `tests/reminders-render.test.ts` HAQIQIY `messages/*.json` bilan
 * render qiladi — bu `lib/` dagi kalitlarning YAGONA qorovuli, chunki
 * `i18n-usage` skaneri faqat `app/` va `components/` ni ko'radi.
 */

/**
 * Kalitni to'liq yo'l bilan oladi ("Reminders.ready", "Week.weekday.3").
 *
 * Nomi `translate`, `t` EMAS: CLAUDE.md "Tekshirish tuzoqlari" — bitta
 * faylda `t` deb atalgan ikki narsa i18n skanerini chalg'itadi.
 */
export type ReminderTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type RenderReminderContext = {
  translate: ReminderTranslate;
  /** `Intl.DateTimeFormat`, `timeZone: "UTC"`. Berilmasa sana chiqmaydi. */
  formatDate?: (date: Date) => string;
  /** Absolyut baza manzili. `null` — havola qatorlari butunlay tushadi. */
  baseUrl: string | null;
  locale: AppLocale;
};

/**
 * Xulosadagi dars chegarasi.
 *
 * Telegram xabari 4096 belgidan oshmasligi kerak. 6 sinfga 6 kun
 * o'qitadigan o'qituvchida 36 blok bo'ladi va chegaradan oshib ketardi —
 * o'shanda Telegram butun xabarni rad etardi, ya'ni o'qituvchi HECH
 * NARSA olmasdi.
 */
export const DIGEST_MAX_LESSONS = 12;

/** "Fizika 7-A" yoki harfsiz "Fizika 7". */
function className(lesson: ReminderLesson, translate: ReminderTranslate): string {
  return lesson.label
    ? translate("Week.classLabel", {
        subject: lesson.subjectName,
        grade: lesson.grade,
        letter: lesson.label,
      })
    : translate("Week.classLabelNoLetter", {
        subject: lesson.subjectName,
        grade: lesson.grade,
      });
}

/** Material yorliqlari, `DOC_TYPE_ORDER` tartibida, ", " bilan. */
function typeLabels(
  types: readonly string[],
  translate: ReminderTranslate,
): string {
  return types.map((type) => translate(`Week.materials.${type}`)).join(", ");
}

/** Bitta darsning bloki: sarlavha qatori + holat + havola. */
function lessonBlock(
  lesson: ReminderLesson,
  context: RenderReminderContext,
  options: { withDay: boolean; withStatus: boolean },
): string {
  const { translate } = context;
  const name = className(lesson, translate);
  const lines: string[] = [];

  if (!options.withDay) {
    lines.push(translate("Reminders.daily.lessonLine", { class: name, topic: lesson.topicTitle }));
  } else if (lesson.weekday === null) {
    // Jadval kiritilmagan sinf — kun aniqlanmaydi, "bu hafta" deyiladi.
    lines.push(translate("Reminders.weekLine", { class: name, topic: lesson.topicTitle }));
  } else {
    lines.push(
      translate("Reminders.lessonLine", {
        day: translate(`Week.weekday.${lesson.weekday}`),
        date: lesson.date && context.formatDate ? context.formatDate(lesson.date) : "",
        class: name,
        topic: lesson.topicTitle,
      }),
    );
  }

  if (options.withStatus) {
    if (lesson.readyTypes.length === 0) {
      lines.push(translate("Reminders.nothingReady"));
    } else {
      lines.push(translate("Reminders.ready", { items: typeLabels(lesson.readyTypes, translate) }));
      if (lesson.missingTypes.length > 0) {
        lines.push(
          translate("Reminders.missing", { items: typeLabels(lesson.missingTypes, translate) }),
        );
      }
    }
  }

  const url = lessonUrl(context.baseUrl, context.locale, lesson);
  if (url) lines.push(url);

  return lines.join("\n");
}

function joinBlocks(header: string, blocks: string[], tail?: string): string {
  const parts = [header, ...blocks];
  if (tail) parts.push(tail);
  // Bloklar bo'sh qator bilan ajraladi; bo'sh elementlar tushib ketadi,
  // shuning uchun `baseUrl: null` da osilib qolgan bo'sh qator qolmaydi.
  return parts.filter((part) => part.length > 0).join("\n\n");
}

/** Haftalik xulosa: kunlar, mavzular, nima tayyor / nima yo'q. */
function renderDigest(message: ReminderMessage, context: RenderReminderContext): string {
  const { translate } = context;
  const shown = message.lessons.slice(0, DIGEST_MAX_LESSONS);
  const hidden = message.lessons.length - shown.length;

  return joinBlocks(
    translate("Reminders.digest.summary", {
      lessons: message.lessonCount,
      ready: message.readyCount,
    }),
    shown.map((lesson) => lessonBlock(lesson, context, { withDay: true, withStatus: true })),
    hidden > 0 ? translate("Reminders.andMore", { count: hidden }) : undefined,
  );
}

/**
 * Kunlik: FAQAT ertangi tayyor bo'lmagan darslar.
 *
 * "Tayyor:" qatori umuman chiqmaydi — `planReminders` ning 5-darvozasi
 * bo'yicha bu ro'yxatdagi har bir dars tayyor emas. Kun nomi ham yo'q:
 * u har doim "ertaga".
 */
function renderDaily(message: ReminderMessage, context: RenderReminderContext): string {
  return joinBlocks(
    context.translate("Reminders.daily.title", { count: message.lessons.length }),
    message.lessons.map((lesson) =>
      lessonBlock(lesson, context, { withDay: false, withStatus: false }),
    ),
  );
}

export function renderReminder(
  message: ReminderMessage,
  context: RenderReminderContext,
): string {
  return message.kind === "weeklyDigest"
    ? renderDigest(message, context)
    : renderDaily(message, context);
}

/**
 * `/bugun` buyrug'i uchun — kunlik eslatmadan ALOHIDA.
 *
 * Farqi: bu "ertaga" emas "bugun", va TAYYOR darslar ham ko'rsatiladi
 * (o'qituvchi so'rab olgan, ya'ni to'liq manzara kerak — bu bezovta
 * qiluvchi eslatma emas).
 */
export function renderToday(
  lessons: ReminderLesson[],
  context: RenderReminderContext,
): string {
  return joinBlocks(
    context.translate("Reminders.today.title"),
    lessons.map((lesson) => lessonBlock(lesson, context, { withDay: false, withStatus: true })),
  );
}
