import { dayNumber, type PlacementSlot } from "@/lib/calendar/placement";

/**
 * "Rejam" sahifasi uchun ko'rinish qatorlari — SOF modul.
 *
 * Sahifadan ajratilgani uchun holat hisobi (o'tilgan/hozirgi/oldinda) va
 * chorakka guruhlash unit test bilan qoplanadi, React render'i bilan emas.
 */

export type PlanTopicStatus = "done" | "current" | "ahead";

export type PlanRow = {
  topicId: string;
  /** Ko'rinadigan chorak. `null` — sana topilmagan (chorak ham noaniq). */
  quarter: number | null;
  /** Mavzuning birinchi darsi. `null` — sana topilmagan. */
  firstDate: Date | null;
  /** Ajratilgan soat (slot soni; sana topilmasa 0). */
  hours: number;
  status: PlanTopicStatus;
  /** Bittasi bo'lsa ham boshqa mavzu bilan dars bo'lishgan. */
  compressed: boolean;
};

type QuarterRange = { number: number; startsOn: Date; endsOn: Date };

function quarterOfDate(quarters: QuarterRange[], date: Date): number | null {
  const day = dayNumber(date);
  const found = quarters.find(
    (quarter) => day >= dayNumber(quarter.startsOn) && day <= dayNumber(quarter.endsOn),
  );
  return found?.number ?? null;
}

type Aggregate = { first: Date; last: Date; hours: number; compressed: boolean };

/** Mavzu bo'yicha slotlarni yig'adi. `slots` saralangan deb kutiladi. */
function aggregate(slots: PlacementSlot[]): Map<string, Aggregate> {
  const byTopic = new Map<string, Aggregate>();
  for (const slot of slots) {
    const existing = byTopic.get(slot.topicId);
    if (!existing) {
      byTopic.set(slot.topicId, {
        first: slot.date,
        last: slot.date,
        hours: 1,
        compressed: slot.compressed,
      });
      continue;
    }
    if (slot.date < existing.first) existing.first = slot.date;
    if (slot.date > existing.last) existing.last = slot.date;
    existing.hours += 1;
    existing.compressed = existing.compressed || slot.compressed;
  }
  return byTopic;
}

/**
 * Holat: `currentTopicId` ustun, keyin "oxirgi darsi bugundan oldin
 * bo'lganmi". Ikkisining tartibi MUHIM — hozirgi mavzuning birinchi soatlari
 * allaqachon o'tilgan bo'lishi mumkin (3 soatlik mavzuning 2-haftasi), va u
 * "o'tilgan" deb ko'rsatilsa o'qituvchi rejadan chalg'irdi.
 */
function statusOf(
  topicId: string,
  data: Aggregate | undefined,
  currentTopicId: string | null,
  today: Date,
): PlanTopicStatus {
  if (topicId === currentTopicId) return "current";
  if (data && dayNumber(data.last) < dayNumber(today)) return "done";
  return "ahead";
}

export function buildPlanRows(args: {
  topics: { id: string; quarter: number | null }[];
  slots: PlacementSlot[];
  quarters: QuarterRange[];
  currentTopicId: string | null;
  today: Date;
}): PlanRow[] {
  const { topics, slots, quarters, currentTopicId, today } = args;
  const byTopic = aggregate(slots);

  return topics.map((topic) => {
    const data = byTopic.get(topic.id);
    const firstDate = data?.first ?? null;
    // Belgilangan chorak ustun: mavzu o'sha chorakda o'tishi kafolatlangan.
    // Belgilanmagani sanasidan kelib chiqib guruhlanadi.
    const quarter =
      topic.quarter ?? (firstDate === null ? null : quarterOfDate(quarters, firstDate));

    return {
      topicId: topic.id,
      quarter,
      firstDate,
      hours: data?.hours ?? 0,
      status: statusOf(topic.id, data, currentTopicId, today),
      compressed: data?.compressed ?? false,
    };
  });
}
