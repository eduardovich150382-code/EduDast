import {
  currentTopicIdOn,
  dayNumber,
  dayToDate,
  isoWeekday,
  placeTopics,
  weekKey,
  type PlacementAnchor,
  type PlacementHoliday,
  type PlacementQuarter,
  type PlacementSlot,
  type PlacementTopic,
  type UnplacedTopic,
} from "@/lib/calendar/placement";

/**
 * "Hozir qaysi mavzudamiz" — BITTA sinf uchun joriy haftaning holati
 * (docs/sessions/09-dars-jadvali.md, 4-band).
 *
 * SOF MODUL: bazaga bormaydi, argumentsiz `new Date()` chaqirmaydi
 * (`placement.ts` bilan bir xil shartnoma). `today` ni chaqiruvchi beradi:
 * `schoolDay(new Date())`. Kun matematikasi QAYTA YOZILMAGAN — hammasi
 * `placement.ts` dan import qilinadi, aks holda ikki nusxa vaqt o'tib
 * jimgina ajralib ketardi ("ikki soat" muammosi).
 *
 * BITTA SINF UCHUN, ataylab: "7-A va 7-B turli mavzuda" shundan o'z-o'zidan
 * kelib chiqadi — turli `anchor`, turli `topicOffset`, turli `lessonsPerWeek`,
 * bir xil sof funksiya. Sinflar bir-biriga ta'sir qila olmaydi, chunki umumiy
 * holat yo'q.
 *
 * UCH XIL NARSA — ARALASHTIRILMAYDI:
 *
 * 1. **Reja** (`placeTopics`) — kurikulum + kalendar + jadval. "Qaysi mavzu
 *    qaysi kunga tushadi."
 * 2. **Kalibrovka** (`anchor`, `TopicProgress.taughtOn` dan) — rejaning
 *    SANALARINI suradi: "t5 ni aslida 15-sentabrda tugatganmiz". Bu TARIX,
 *    ya'ni audit yozuvidan kelib chiqadi.
 * 3. **Ko'rsatkich** (`topicOffset`, `TeachingClass` ustuni) — "hozir
 *    qayerdamiz". ‹ › tugmalari AYNAN shuni o'zgartiradi.
 *
 * NEGA KO'RSATKICH ALOHIDA USTUN: avval surish `TopicProgress` ga `DONE`
 * yozish orqali qilingan edi va u ISHLAMASDI. Anchor — SANA: joriy mavzuni
 * bugungi kun bilan belgilash rejani o'zi turgan joyiga "qadaydi"
 * (`anchorShift` dagi `delta` nolga teng), ya'ni ekranda hech narsa
 * o'zgarmasdi. Ko'rsatkich indeks bo'lgani uchun bu muammo yo'q.
 *
 * Shu sababli `shiftClassPosition` FAQAT `topicOffset` ni o'zgartiradi va
 * `TopicProgress` ga TEGMAYDI; tarixni esa `markTopicTaught` yozadi. Ikki
 * yo'nalish bir-biriga qo'shilib ketmasligi uchun shunday.
 *
 * IKKI REJIM (spek 4-bandi):
 * - `mode: "days"` — `weekdays` (`ScheduleSlot` dan) bor: har dars kunining
 *   mavzusi, bugungi va ertangi mavzu aniq.
 * - `mode: "week"` — jadval kiritilmagan: FAQAT "bu hafta qaysi mavzu".
 *   `days` bo'sh, `todayTopicId`/`tomorrowTopicId` — `null`.
 *
 * `mode: "week"` NEGA SHUNDAY HISOBLANADI: `placeTopics` bo'sh `weekdays` da
 * BITTA ham slot qaytarmaydi (`buildCandidateDays` darhol `[]` beradi), ya'ni
 * "faqat hafta" ham hisoblanmay qolardi. Shuning uchun sun'iy
 * `FALLBACK_WEEKDAYS` (dushanba–shanba) beriladi va `buildCandidateDays` ning
 * o'z chegarasi haftada aynan `lessonsPerWeek` ta nomzod qoldiradi. Hafta
 * DARAJASIDAGI javob shu bilan to'g'ri; KUN darajasi esa ataylab yopiladi,
 * chunki qaysi kun tanlangani tasodifiy.
 *
 * SHU REJIMNING ANIQ CHEKLOVI: bayram dushanbaga tushsa, haqiqatda
 * seshanba–payshanba o'qiydigan sinf uchun ham nomzod kuni "yeyiladi". Ya'ni
 * `mode: "week"` da bayram ta'siri TAXMINIY. Kun aniq kerak bo'lsa o'qituvchi
 * jadvalni kiritishi kerak — bosh sahifa aynan shuni taklif qiladi.
 */

/** Jadval yo'q rejimda ishlatiladigan sun'iy dars kunlari (dushanba–shanba). */
const FALLBACK_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export type PositionMode = "days" | "week";

/** Joriy haftaning BITTA dars kuni. */
export type PositionDay = {
  /** UTC yarim kecha. */
  date: Date;
  /** ISO hafta kuni, 1 = dushanba (`ScheduleSlot.weekday` bilan bir xil). */
  weekday: number;
  /**
   * O'sha kunda o'tiladigan mavzular, `order` bo'yicha, takrorsiz.
   * Bittadan ko'p bo'lishi — tig'izlashtirilgan kun
   * (`PlacementSlot.compressed`).
   */
  topicIds: string[];
  /** Kun bugundan oldinmi (o'tib ketgan darsni UI so'niqroq ko'rsatadi). */
  past: boolean;
};

export type PositionInput = {
  quarters: PlacementQuarter[];
  holidays: PlacementHoliday[];
  /** `flattenTopicTree()` natijasi — GLOBAL `order` SHART (topic-sequence.ts). */
  topics: PlacementTopic[];
  /** `TeachingClass.lessonsPerWeek`. */
  lessonsPerWeek: number;
  /** `ScheduleSlot.weekday` lar. BO'SH BO'LISHI MUMKIN (jadval kiritilmagan). */
  weekdays: number[];
  /**
   * KALIBROVKA: oxirgi `DONE` `TopicProgress` (eng katta `taughtOn`).
   * Rejaning SANALARINI suradi — "bu mavzuni aslida o'sha kuni tugatganmiz".
   * Ko'rsatkichni surmaydi (pastdagi `topicOffset` ga qarang).
   */
  anchor?: PlacementAnchor;
  /**
   * KO'RSATKICH: `TeachingClass.topicOffset`. Ko'rinadigan mavzu = reja
   * bo'yicha indeks + shu qiymat, haqiqiy ro'yxat chegarasiga qisilgan.
   * Berilmasa 0.
   */
  topicOffset?: number;
  /** `schoolDay(new Date())` — bu modul soatga QARAMAYDI. */
  today: Date;
  maxTopicsPerLesson?: number;
};

export type ClassPosition = {
  mode: PositionMode;
  /** Joriy ISO hafta: dushanba va yakshanba, UTC yarim kecha. */
  weekStart: Date;
  weekEnd: Date;
  /** FAQAT dars bor kunlar (spek 5-band). `mode: "week"` da hamisha bo'sh. */
  days: PositionDay[];
  /** Shu haftada o'tiladigan mavzular, `order` bo'yicha, takrorsiz. */
  weekTopicIds: string[];
  /** Bugun dars bo'lmasa `null`. Tig'izlangan kunda — ENG KATTA `order` li. */
  todayTopicId: string | null;
  /** Ertaga dars bo'lmasa `null`. Ertangi kun KEYINGI haftaga tushsa ham topiladi. */
  tomorrowTopicId: string | null;
  /**
   * "Hozir qaysi mavzudamiz" — `today` dan katta bo'lmagan oxirgi slot
   * (`currentTopicIdOn`). Yakshanba va ta'tilda ham qiymat beradi.
   */
  currentTopicId: string | null;
  /** ‹ tugmasi uchun. Birinchi mavzuda `null` (chegara). */
  previousTopicId: string | null;
  /** › tugmasi uchun. Oxirgi mavzuda `null` (chegara). */
  nextTopicId: string | null;
  /** `placeTopics` dan o'tkaziladi — chaqiruvchi tushib qolgan mavzuni sezsin. */
  unplaced: UnplacedTopic[];
  /** `false` — anchor eskirgan (mavzu ro'yxatda yo'q) va E'TIBORGA OLINMADI. */
  anchorApplied: boolean;
};

function normalizeWeekdays(weekdays: number[]): number[] {
  const out = new Set<number>();
  for (const value of weekdays) {
    if (!Number.isInteger(value) || value < 1 || value > 7) continue;
    out.add(value);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Kun raqami -> o'sha kundagi mavzular, `order` bo'yicha, takrorsiz.
 *
 * KIRISH SHARTI: `slots` — `placeTopics` qaytargan massiv, ya'ni
 * (kun, order, lessonIndex) bo'yicha SARALANGAN. Shu sabab kiritish tartibi
 * `order` tartibiga teng va alohida `sort` kerak emas.
 */
function topicsByDay(slots: PlacementSlot[]): Map<number, string[]> {
  const byDay = new Map<number, string[]>();
  for (const slot of slots) {
    const day = dayNumber(slot.date);
    const list = byDay.get(day);
    if (!list) byDay.set(day, [slot.topicId]);
    else if (!list.includes(slot.topicId)) list.push(slot.topicId);
  }
  return byDay;
}

export function positionForClass(input: PositionInput): ClassPosition {
  const weekdays = normalizeWeekdays(input.weekdays);
  const mode: PositionMode = weekdays.length > 0 ? "days" : "week";

  const placement = placeTopics({
    quarters: input.quarters,
    holidays: input.holidays,
    topics: input.topics,
    lessonsPerWeek: input.lessonsPerWeek,
    weekdays: mode === "days" ? weekdays : FALLBACK_WEEKDAYS,
    anchor: input.anchor,
    maxTopicsPerLesson: input.maxTopicsPerLesson,
  });

  const ordered = [...input.topics].sort((a, b) => a.order - b.order);
  const indexById = new Map(ordered.map((topic, index) => [topic.id, index]));
  // Butun bo'lmagan yoki berilmagan qiymat 0 deb olinadi — bazadagi ustun
  // `Int`, lekin modul sof bo'lgani uchun kirishga ishonmaydi.
  const offset =
    input.topicOffset !== undefined && Number.isInteger(input.topicOffset)
      ? input.topicOffset
      : 0;

  /**
   * Reja bo'yicha mavzuni KO'RSATKICH bo'yicha mavzuga aylantiradi.
   *
   * Chegara HAQIQIY ro'yxatga qisiladi: birinchi mavzudan oldinga ham,
   * oxirgisidan keyinga ham chiqib bo'lmaydi. Qisish shu yerda bo'lgani
   * uchun bazadagi `topicOffset` qanchalik katta bo'lsa ham ko'rinish
   * buzilmaydi (masalan mavzular ro'yxati qisqarib qolsa).
   */
  const shift = (topicId: string): string => {
    const index = indexById.get(topicId);
    if (index === undefined) return topicId;
    const moved = Math.min(Math.max(index + offset, 0), ordered.length - 1);
    return ordered[moved]?.id ?? topicId;
  };

  // BITTA `Map` — hafta kunlari, bugun VA ertaga shundan o'qiladi. Ertangi kun
  // keyingi ISO haftaga tushishi mumkin (bugun yakshanba bo'lsa), shuning
  // uchun u hafta oynasidan emas, BUTUN `slots` dan qidiriladi.
  const planByDay = topicsByDay(placement.slots);
  // Kunlar ham KO'RSATKICH bo'yicha suriladi: aks holda sarlavhada bir mavzu,
  // kunlar ro'yxatida boshqasi turardi. Qisish tufayli chetda takror paydo
  // bo'lishi mumkin, shuning uchun takrorsizlantiramiz.
  const byDay = new Map<number, string[]>(
    [...planByDay].map(([day, ids]) => [day, [...new Set(ids.map(shift))]]),
  );

  const todayDay = dayNumber(input.today);
  const weekStartDay = todayDay - (isoWeekday(todayDay) - 1);

  const days: PositionDay[] = [];
  const weekTopicIds: string[] = [];
  for (let day = weekStartDay; day <= weekStartDay + 6; day += 1) {
    const topicIds = byDay.get(day);
    if (!topicIds || topicIds.length === 0) continue;
    for (const id of topicIds) if (!weekTopicIds.includes(id)) weekTopicIds.push(id);
    // Jadval yo'q rejimda KUN chiqarilmaydi — qaysi kun tanlangani tasodifiy.
    if (mode === "days") {
      days.push({ date: dayToDate(day), weekday: isoWeekday(day), topicIds, past: day < todayDay });
    }
  }

  const planTopicId = currentTopicIdOn(placement.slots, input.today);
  const currentTopicId = planTopicId === null ? null : shift(planTopicId);
  const index = currentTopicId === null ? -1 : (indexById.get(currentTopicId) ?? -1);

  // Tig'izlangan kunda OXIRGISI — `currentTopicIdOn` bilan bir xil qoida (eng
  // katta `order`). To'liq ro'yxat `days[].topicIds` da qoladi.
  const lastOf = (day: number) => byDay.get(day)?.at(-1) ?? null;

  return {
    mode,
    weekStart: dayToDate(weekStartDay),
    weekEnd: dayToDate(weekStartDay + 6),
    days,
    weekTopicIds,
    todayTopicId: mode === "days" ? lastOf(todayDay) : null,
    tomorrowTopicId: mode === "days" ? lastOf(todayDay + 1) : null,
    currentTopicId,
    // Chegara: birinchi mavzuda orqaga yo'l yo'q.
    previousTopicId: index > 0 ? (ordered[index - 1]?.id ?? null) : null,
    // `index < 0` — reja hali boshlanmagan: "keyingi" = birinchi mavzu.
    // Oxirgi mavzuda `ordered[index + 1]` — `undefined`, ya'ni chegara.
    nextTopicId: index < 0 ? (ordered[0]?.id ?? null) : (ordered[index + 1]?.id ?? null),
    unplaced: placement.unplaced,
    anchorApplied: placement.anchorApplied,
  };
}

/**
 * "2-chorak, 5-hafta" — bosh sahifa sarlavhasi uchun.
 *
 * Hafta dushanbadan uziladi (`weekKey`), chorak boshlangan hafta — 1-hafta.
 * `null` — bugun hech qaysi chorakka tushmaydi (ta'til yoki yoz).
 */
export function teachingWeek(
  quarters: PlacementQuarter[],
  today: Date,
): { quarter: number; week: number } | null {
  const day = dayNumber(today);
  for (const quarter of quarters) {
    const start = dayNumber(quarter.startsOn);
    if (day < start || day > dayNumber(quarter.endsOn)) continue;
    return { quarter: quarter.number, week: weekKey(day) - weekKey(start) + 1 };
  }
  return null;
}
