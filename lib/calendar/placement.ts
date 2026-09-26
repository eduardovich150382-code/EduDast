/**
 * Mavzularni o'quv yili kalendariga joylash — MAHSULOTNING YURAGI.
 *
 * SOF MODUL: bazaga bormaydi, argumentsiz `new Date()` chaqirmaydi, npm sana
 * paketi ishlatmaydi. Hammasi parametr orqali keladi, shuning uchun butun
 * mantiq oddiy unit test bilan qoplanadi (tests/calendar-placement.test.ts).
 *
 * SANA SHARTNOMASI: ichkarida hammasi "epoch kun raqami" (butun son), tashqi
 * `Date` lar UTC yarim kecha deb o'qiladi va shunday qaytariladi. `getUTC*`
 * ATAYLAB — `getFullYear()` ishlatilsa `2026-09-01T00:00:00Z` qatori UTC-5
 * runner'da "31 avgust" bo'lib butun reja bir kunga siljiydi. Sxemada
 * `@db.Date` yo'q, shuning uchun `server/calendar-actions.ts` kalendar
 * sanalarini UTC yarim kecha qilib yozishi SHART.
 *
 * IKKI XIL QOIDA (07-sessiya, foydalanuvchi tuzatishi):
 *
 * 1. `quarter` BELGILANGAN mavzu o'z chorogida tugaydi — keyingi chorakka
 *    SURILMAYDI. Bayram dars kunini yeb qo'ysa, o'sha kungi mavzu keyingi
 *    darsga qo'shiladi va o'sha darsda ikkita mavzu o'tiladi
 *    (TIG'IZLASHTIRISH, `maxTopicsPerLesson` gacha). Siljish kaskad bo'lib
 *    ketadi, lekin chorak chegarasidan chiqmaydi.
 * 2. `quarter: null` mavzu — `order` bo'yicha ketma-ket, chorak chegarasidan
 *    ERKIN oqib o'tadi, TIG'IZLASHMAYDI.
 *
 * SPEKDAN CHETLASHISH: `PlacementResult` da `unplaced` va `anchorApplied`
 * bor (spekda faqat `slots` va `currentTopicId`). Sababi: jimgina tushib
 * qolgan mavzuni hech bir chaqiruvchi sezmaydi — har biri `topics`/`slots`
 * farqini o'zi hisoblashi kerak bo'lardi va bittasi albatta unutardi.
 * `anchorApplied` esa eskirgan "o'tildi" belgisini ko'rsatadi: usiz funksiya
 * anchor'ni JIMGINA e'tiborsiz qoldirardi.
 */

export type PlacementQuarter = { number: number; startsOn: Date; endsOn: Date };
export type PlacementHoliday = { startsOn: Date; endsOn: Date };
export type PlacementTopic = {
  id: string;
  quarter: number | null;
  /** Global ketma-ketlik — lib/calendar/topic-sequence.ts dan. */
  order: number;
  hoursPlan: number | null;
};
/** Oxirgi "o'tildi" belgisi. `taughtOn` — mavzuning OXIRGI soati sanasi. */
export type PlacementAnchor = { topicId: string; taughtOn: Date };

export type PlacementInput = {
  quarters: PlacementQuarter[];
  holidays: PlacementHoliday[];
  topics: PlacementTopic[];
  /** ISO haftadagi soat SHIFTI (maqsad emas). */
  lessonsPerWeek: number;
  /** Dars kunlari, 1 = dushanba. */
  weekdays: number[];
  anchor?: PlacementAnchor;
  /** Bitta darsga ko'pi bilan shuncha mavzu (tig'izlash chegarasi). */
  maxTopicsPerLesson?: number;
};

export type PlacementSlot = {
  date: Date;
  topicId: string;
  /** Mavzu ichidagi soat raqami, 0'dan. */
  lessonIndex: number;
  /** Bu mavzu darsni boshqa mavzu bilan bo'lishadi (tig'izlashtirilgan). */
  compressed: boolean;
};

export type UnplacedTopic = {
  topicId: string;
  /** Sana topilmagan soatlar soni. */
  missingHours: number;
  /**
   * `year_end` — erkin oqim yil oxiriga yetdi.
   * `quarter_overflow` — tig'izlash bilan ham chorakka sig'madi, ya'ni bu
   * dars jadvali muammosi emas, kurikulum muammosi.
   */
  reason: "year_end" | "quarter_overflow";
};

export type PlacementResult = {
  slots: PlacementSlot[];
  currentTopicId: (on: Date) => string | null;
  unplaced: UnplacedTopic[];
  anchorApplied: boolean;
};

export const DEFAULT_MAX_TOPICS_PER_LESSON = 2;

const MS_PER_DAY = 86_400_000;
/** Toshkent UTC+5, DST yo'q. */
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY,
  );
}

function dayToDate(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

/** Epoch kun 0 (1970-01-01) — payshanba, shuning uchun +3. */
function isoWeekday(day: number): number {
  return ((day + 3) % 7) + 1;
}

/** Hafta dushanbadan uziladi. */
function weekKey(day: number): number {
  return Math.floor((day + 3) / 7);
}

/**
 * Haqiqiy vaqt lahzasini Toshkent kalendar kuniga (UTC yarim kecha)
 * aylantiradi. `currentTopicIdOn(slots, schoolDay(new Date()))` uchun — bu
 * modul o'zi soatga qaramaydi, lekin chaqiruvchi to'g'ri aylantirishi kerak:
 * Toshkentda 01:00 (UTC'da hali kechagi kun) allaqachon yangi kun.
 */
export function schoolDay(instant: Date): Date {
  return dayToDate(Math.floor((instant.getTime() + UZ_OFFSET_MS) / MS_PER_DAY));
}

type DayRange = { start: number; end: number };
type NormalQuarter = { number: number; start: number; end: number };

function normalizeWeekdays(weekdays: number[]): Set<number> {
  const out = new Set<number>();
  for (const value of weekdays) {
    if (!Number.isInteger(value) || value < 1 || value > 7) continue;
    out.add(value);
  }
  return out;
}

/** Teskari oraliq tashlanadi — admin xatosi jimgina reja buzmasin. */
function normalizeQuarters(quarters: PlacementQuarter[]): NormalQuarter[] {
  return quarters
    .map((quarter) => ({
      number: quarter.number,
      start: dayNumber(quarter.startsOn),
      end: dayNumber(quarter.endsOn),
    }))
    .filter((quarter) => quarter.end >= quarter.start)
    .sort((a, b) => a.start - b.start || a.number - b.number);
}

function normalizeHolidays(holidays: PlacementHoliday[]): DayRange[] {
  return holidays
    .map((holiday) => ({ start: dayNumber(holiday.startsOn), end: dayNumber(holiday.endsOn) }))
    .filter((range) => range.end >= range.start)
    .sort((a, b) => a.start - b.start);
}

/** Yiliga ~10 oraliq — chiziqli qidiruv yetarli, indeks qurish ortiqcha. */
function isHoliday(ranges: DayRange[], day: number): boolean {
  return ranges.some((range) => day >= range.start && day <= range.end);
}

type CandidateDay = {
  day: number;
  quarter: number;
  /** Nomzod VA ta'til/bayram emas. */
  teachable: boolean;
};

/**
 * NOMZOD kunlar — ta'til O'CHIRILMAYDI, faqat `teachable` bayrog'i bilan
 * belgilanadi. Sababi: tig'izlash qoidasi "tabiiy kun bayramga tushdi" degan
 * ma'lumotga muhtoj, erkin oqim esa faqat `teachable` larni ko'radi.
 *
 * Choraklar ORASI nomzod bermaydi — chorak a'zoligi asosiy filtr. Shuning
 * uchun kuz/qish ta'tilini `Holiday` ga qo'shish kerak emas, u shunchaki
 * choraklar orasidagi bo'shliq.
 */
function buildCandidateDays(
  quarters: NormalQuarter[],
  holidays: DayRange[],
  weekdays: Set<number>,
  lessonsPerWeek: number,
): CandidateDay[] {
  const first = quarters[0];
  if (!first || weekdays.size === 0 || lessonsPerWeek < 1) return [];
  const last = quarters.reduce((max, quarter) => Math.max(max, quarter.end), first.end);

  const perWeek = new Map<number, number>();
  const out: CandidateDay[] = [];

  for (let day = first.start; day <= last; day += 1) {
    const quarter = quarters.find((item) => day >= item.start && day <= item.end);
    if (!quarter) continue;
    if (!weekdays.has(isoWeekday(day))) continue;

    const week = weekKey(day);
    const used = perWeek.get(week) ?? 0;
    if (used >= lessonsPerWeek) continue;
    perWeek.set(week, used + 1);

    out.push({ day, quarter: quarter.number, teachable: !isHoliday(holidays, day) });
  }

  return out;
}

/** Spek qoidasi: `hoursPlan` bo'sh — 1 soat. Qolgani buzuq qiymatdan himoya. */
function effectiveHours(hoursPlan: number | null): number {
  if (hoursPlan === null || !Number.isFinite(hoursPlan)) return 1;
  return Math.max(1, Math.floor(hoursPlan));
}

/**
 * `order` bo'yicha STABIL sort. `quarter` bo'yicha guruhlash YO'Q — u
 * `quarter: null` mavzularni bir joyga yig'ib, spekning "belgilanmagan
 * mavzular `order` bo'yicha ketma-ket" qoidasini buzardi.
 */
function orderTopics(topics: PlacementTopic[]): PlacementTopic[] {
  return [...topics].sort((a, b) => a.order - b.order);
}

type RawSlot = { day: number; topicId: string; order: number; lessonIndex: number };
/** Kun -> o'sha kunda darsi bor mavzular. To'plam o'lchami = kun yuklamasi. */
type DayLoad = Map<number, Set<string>>;

function canPlace(dayLoad: DayLoad, day: number, topicId: string, maxPerLesson: number): boolean {
  const load = dayLoad.get(day);
  if (!load) return true;
  // Bir darsda bitta mavzu ikki marta o'tilmaydi.
  return load.size < maxPerLesson && !load.has(topicId);
}

function occupy(dayLoad: DayLoad, day: number, topicId: string): void {
  const load = dayLoad.get(day);
  if (load) load.add(topicId);
  else dayLoad.set(day, new Set([topicId]));
}

type PhaseResult = { slots: RawSlot[]; unplaced: UnplacedTopic[] };

function addMissing(unplaced: UnplacedTopic[], topicId: string, reason: UnplacedTopic["reason"]) {
  const existing = unplaced.find((item) => item.topicId === topicId && item.reason === reason);
  if (existing) existing.missingHours += 1;
  else unplaced.push({ topicId, missingHours: 1, reason });
}

/**
 * A-FAZA — `quarter` belgilangan mavzular, har chorak alohida.
 *
 * Ikki qadam: (1) soat o'zining TABIIY kuniga tayinlanadi
 * (`candidates[start + i]`), (2) bayramga tushgani yoki kun to'lgani
 * oldinga suriladi — o'z indeksidan KEYINGI birinchi bo'sh joyga.
 *
 * Shu tartib "bayramdan keyingi darsda 2 mavzu" ni tabiiy beradi:
 * `maxTopicsPerLesson = 2` da bitta bayram bitta darsni ikki mavzuli qiladi,
 * ketma-ket ikki bayram — ikkita darsni, bittasini uch mavzuli QILMAYDI,
 * chunki to'lgan kun keyingisiga surib yuboradi.
 *
 * Qidiruv FAQAT oldinga va faqat shu chorak ichida: orqaga qarash mavzular
 * tartibini buzardi, chorakdan chiqish esa 1-qoidani buzardi. Joy topilmasa
 * `quarter_overflow` — tig'izlash bilan ham sig'madi.
 */
function placePinned(
  candidates: CandidateDay[],
  topics: PlacementTopic[],
  startOffset: number,
  dayLoad: DayLoad,
  maxPerLesson: number,
): PhaseResult {
  const slots: RawSlot[] = [];
  const unplaced: UnplacedTopic[] = [];
  let hourIndex = startOffset;

  for (const topic of topics) {
    const hours = effectiveHours(topic.hoursPlan);
    for (let lessonIndex = 0; lessonIndex < hours; lessonIndex += 1) {
      const natural = candidates[hourIndex];
      hourIndex += 1;

      let target =
        natural && natural.teachable && canPlace(dayLoad, natural.day, topic.id, maxPerLesson)
          ? natural
          : undefined;

      if (!target) {
        for (let next = hourIndex; next < candidates.length; next += 1) {
          const candidate = candidates[next];
          if (!candidate || !candidate.teachable) continue;
          if (!canPlace(dayLoad, candidate.day, topic.id, maxPerLesson)) continue;
          target = candidate;
          break;
        }
      }

      if (!target) {
        addMissing(unplaced, topic.id, "quarter_overflow");
        continue;
      }
      occupy(dayLoad, target.day, topic.id);
      slots.push({ day: target.day, topicId: topic.id, order: topic.order, lessonIndex });
    }
  }

  return { slots, unplaced };
}

/**
 * B-FAZA — `quarter: null` mavzular: butun yilning dars kunlari oqimi
 * bo'ylab bitta kursor, bitta kunga bitta mavzu, TIG'IZLASHMAYDI.
 *
 * A-faza egallagan kun shunchaki o'tkazib yuboriladi (`dayLoad` ikki faza
 * uchun umumiy), shuning uchun hech bir kun `maxTopicsPerLesson` dan
 * oshmaydi. Oqim tugasa — `year_end`.
 */
function placeFloating(
  stream: number[],
  topics: PlacementTopic[],
  startOffset: number,
  dayLoad: DayLoad,
): PhaseResult {
  const slots: RawSlot[] = [];
  const unplaced: UnplacedTopic[] = [];
  let cursor = Math.max(0, startOffset);

  for (const topic of topics) {
    const hours = effectiveHours(topic.hoursPlan);
    for (let lessonIndex = 0; lessonIndex < hours; lessonIndex += 1) {
      while (cursor < stream.length) {
        const day = stream[cursor];
        if (day !== undefined && !dayLoad.has(day)) break;
        cursor += 1;
      }
      const day = stream[cursor];
      if (day === undefined) {
        addMissing(unplaced, topic.id, "year_end");
        continue;
      }
      occupy(dayLoad, day, topic.id);
      slots.push({ day, topicId: topic.id, order: topic.order, lessonIndex });
      cursor += 1;
    }
  }

  return { slots, unplaced };
}

/** `value` dan katta bo'lmagan oxirgi elementning indeksi, topilmasa -1. */
function lastIndexAtOrBefore(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = sorted[mid];
    if (item === undefined) break;
    if (item <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Bir sanada bittadan ko'p HAR XIL mavzu bo'lsa, o'sha sanadagi hamma slot
 * `compressed: true`. Bir marta, oxirida hisoblanadi.
 */
function markCompressed(slots: RawSlot[]): PlacementSlot[] {
  const topicsPerDay = new Map<number, Set<string>>();
  for (const slot of slots) {
    const set = topicsPerDay.get(slot.day);
    if (set) set.add(slot.topicId);
    else topicsPerDay.set(slot.day, new Set([slot.topicId]));
  }

  return slots.map((slot) => ({
    date: dayToDate(slot.day),
    topicId: slot.topicId,
    lessonIndex: slot.lessonIndex,
    compressed: (topicsPerDay.get(slot.day)?.size ?? 1) > 1,
  }));
}

/**
 * `on` dan katta bo'lmagan OXIRGI kunning ENG KATTA `order` li mavzusi.
 *
 * "Massivdagi oxirgi slot" EMAS, ataylab: A-fazaning siljitish qadami
 * surilgan soatni massivga KEYIN qo'shadi, lekin u ESKIROQ mavzuga tegishli.
 * Tig'izlangan kunda "massivdagi oxirgi" orqadagi mavzuni qaytarardi, ya'ni
 * "Rejam" bugungi mavzu deb allaqachon o'tilganini ko'rsatardi. Shuning
 * uchun `placeTopics` `slots` ni (kun, order, lessonIndex) bo'yicha saralaydi
 * va bu funksiya o'sha kunning eng katta `order` ini oladi.
 *
 * KIRISH SHARTI: `slots` — `placeTopics` qaytargan (saralangan) massiv.
 */
export function currentTopicIdOn(slots: PlacementSlot[], on: Date): string | null {
  const days = slots.map((slot) => dayNumber(slot.date));
  const index = lastIndexAtOrBefore(days, dayNumber(on));
  // Saralangani uchun o'sha kunning OXIRGI sloti = eng katta `order` li.
  return slots[index]?.topicId ?? null;
}

/** Mavzuni `quarter` bo'yicha ikki fazaga ajratadi. */
function splitByQuarter(
  topics: PlacementTopic[],
  quarterNumbers: Set<number>,
): { pinned: Map<number, PlacementTopic[]>; floating: PlacementTopic[] } {
  const pinned = new Map<number, PlacementTopic[]>();
  const floating: PlacementTopic[] = [];

  for (const topic of topics) {
    // Mavjud bo'lmagan chorakka ishora (admin 3 chorak kiritgan, mavzuda 4;
    // yoki bazada eski `quarter: 5`) — erkin oqimga tushadi. Mavzuni jimgina
    // yo'qotish mumkin emas, uchinchi `reason` ham qo'shilmaydi.
    if (topic.quarter === null || !quarterNumbers.has(topic.quarter)) {
      floating.push(topic);
      continue;
    }
    const bucket = pinned.get(topic.quarter);
    if (bucket) bucket.push(topic);
    else pinned.set(topic.quarter, [topic]);
  }

  return { pinned, floating };
}

/** Mavzuning OXIRGI soati tushgan kun (anchor hisobi uchun). */
function lastSlotDay(slots: RawSlot[], topicId: string): number | null {
  let best: RawSlot | undefined;
  for (const slot of slots) {
    if (slot.topicId !== topicId) continue;
    if (!best || slot.lessonIndex > best.lessonIndex) best = slot;
  }
  return best?.day ?? null;
}

/** `value` dan katta bo'lmagan oxirgi DARS kunining indeksi, topilmasa -1. */
function lastTeachableIndexAtOrBefore(days: CandidateDay[], value: number): number {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const candidate = days[index];
    if (!candidate || candidate.day > value || !candidate.teachable) continue;
    return index;
  }
  return -1;
}

function indexOfDay(days: CandidateDay[], day: number): number {
  return days.findIndex((candidate) => candidate.day === day);
}

type AnchorShift = { offsets: Map<number, number>; floatingOffset: number };

/**
 * Anchor siljishi. `taughtOn` — anchor mavzuning OXIRGI soati sanasi
 * ("o'tildi" = tugadi; bir soatlik mavzularda ikki o'qish bir xil).
 *
 * `delta` = (taughtOn dan katta bo'lmagan oxirgi dars kuni indeksi) -
 * (anchorsiz hisobda anchor oxirgi soati tushgan indeks). Hisob shu `delta`
 * bilan BOSHIDAN qayta yuritiladi, shuning uchun "avvalgi hisob e'tiborsiz
 * qoldiriladi" tuzilma darajasida kafolatlangan.
 *
 * `delta` FAQAT anchor mavzusi turgan chorakka qo'llanadi — keyingi choraklar
 * o'z chegaralaridan boshlanaveradi. Aks holda 1-chorakdagi kechikish yil
 * oxirigacha to'planib hamma chorakni tig'izlab tashlardi, ya'ni "har chorak
 * o'z ichida tugaydi" qoidasi buzilardi.
 *
 * Siljish faqat OLDINGA: `Math.max(0, delta)`. Chorak belgisi POL — mavzu o'z
 * chorogidan oldinga siljimaydi; erkin oqim ham yil boshidan oldin
 * boshlanmaydi (uchinchi `reason` qo'shmaslik uchun).
 *
 * `null` qaytsa anchor QO'LLANMADI: mavzu ro'yxatda yo'q, yoki anchorsiz
 * hisobda unga sana tegmagan. Eskirgan belgi tufayli "Rejam" yiqilmasligi
 * kerak, lekin buni chaqiruvchi bilishi ham kerak (`anchorApplied`).
 */
function anchorShift(
  anchor: PlacementAnchor | undefined,
  ordered: PlacementTopic[],
  baseline: RawSlot[],
  daysOfQuarter: Map<number, CandidateDay[]>,
  stream: number[],
): AnchorShift | null {
  if (!anchor) return null;
  const topic = ordered.find((item) => item.id === anchor.topicId);
  if (!topic) return null;

  const placedDay = lastSlotDay(baseline, anchor.topicId);
  if (placedDay === null) return null;

  const taughtOn = dayNumber(anchor.taughtOn);
  const quarterDays = topic.quarter === null ? undefined : daysOfQuarter.get(topic.quarter);

  if (quarterDays && topic.quarter !== null) {
    const from = indexOfDay(quarterDays, placedDay);
    const to = lastTeachableIndexAtOrBefore(quarterDays, taughtOn);
    if (from < 0 || to < 0) return null;
    return { offsets: new Map([[topic.quarter, Math.max(0, to - from)]]), floatingOffset: 0 };
  }

  const from = stream.indexOf(placedDay);
  const to = lastIndexAtOrBefore(stream, taughtOn);
  if (from < 0 || to < 0) return null;
  return { offsets: new Map(), floatingOffset: Math.max(0, to - from) };
}

export function placeTopics(input: PlacementInput): PlacementResult {
  const quarters = normalizeQuarters(input.quarters);
  const holidays = normalizeHolidays(input.holidays);
  const weekdays = normalizeWeekdays(input.weekdays);
  const maxPerLesson = Math.max(
    1,
    Math.floor(input.maxTopicsPerLesson ?? DEFAULT_MAX_TOPICS_PER_LESSON),
  );

  const candidates = buildCandidateDays(quarters, holidays, weekdays, input.lessonsPerWeek);
  const ordered = orderTopics(input.topics);
  const { pinned, floating } = splitByQuarter(
    ordered,
    new Set(quarters.map((quarter) => quarter.number)),
  );

  const daysOfQuarter = new Map<number, CandidateDay[]>();
  for (const number of pinned.keys()) {
    daysOfQuarter.set(
      number,
      candidates.filter((candidate) => candidate.quarter === number),
    );
  }
  const stream = candidates
    .filter((candidate) => candidate.teachable)
    .map((candidate) => candidate.day);

  const run = (offsets: Map<number, number>, floatingOffset: number): PhaseResult => {
    const dayLoad: DayLoad = new Map();
    const slots: RawSlot[] = [];
    const unplaced: UnplacedTopic[] = [];

    for (const [number, topics] of pinned) {
      const phase = placePinned(
        daysOfQuarter.get(number) ?? [],
        topics,
        offsets.get(number) ?? 0,
        dayLoad,
        maxPerLesson,
      );
      slots.push(...phase.slots);
      unplaced.push(...phase.unplaced);
    }

    const phase = placeFloating(stream, floating, floatingOffset, dayLoad);
    slots.push(...phase.slots);
    unplaced.push(...phase.unplaced);

    return { slots, unplaced };
  };

  let result = run(new Map(), 0);
  const shift = anchorShift(input.anchor, ordered, result.slots, daysOfQuarter, stream);
  if (shift) result = run(shift.offsets, shift.floatingOffset);

  const sorted = [...result.slots].sort(
    (a, b) => a.day - b.day || a.order - b.order || a.lessonIndex - b.lessonIndex,
  );
  const slots = markCompressed(sorted);

  return {
    slots,
    currentTopicId: (on: Date) => currentTopicIdOn(slots, on),
    unplaced: result.unplaced,
    anchorApplied: shift !== null,
  };
}
