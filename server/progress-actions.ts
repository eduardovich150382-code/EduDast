"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { schoolDay } from "@/lib/calendar/placement";
import { positionForClass } from "@/lib/calendar/position";
import { flattenTopicTree } from "@/lib/calendar/topic-sequence";
import { prisma } from "@/lib/db";
import { isoDate } from "@/lib/zod/iso-date";

/**
 * Mavzu holati action'lari (docs/sessions/09-dars-jadvali.md, 6-band).
 *
 * Tartib: `"use server"` -> `requireOnboarded()` -> Zod -> egalik -> yozish ->
 * `revalidatePath`. Auth BIRINCHI await (CLAUDE.md 6-qoida).
 *
 * ANCHOR SHARTNOMASI: `TopicProgress.taughtOn` — mavzuning OXIRGI soati
 * sanasi, UTC yarim kecha (`lib/calendar/placement.ts` dagi `PlacementAnchor`).
 * Mahalliy yarim kecha yozilsa butun reja bir kunga siljiydi va hech qayerda
 * xato chiqmaydi — shuning uchun `schoolDay(new Date())` MAJBURIY.
 *
 * IKKI YO'NALISH ARALASHTIRILMAYDI:
 * - `markTopicTaught` -> `TopicProgress` (TARIX/audit: "qachon o'tdik"). U
 *   rejaning SANALARINI kalibrlaydi.
 * - `shiftClassPosition` -> `TeachingClass.topicOffset` (KO'RSATKICH: "hozir
 *   qayerdamiz"). U `TopicProgress` ga TEGMAYDI.
 *
 * Nega shunday: avval surish `DONE` yozish orqali qilingan edi va ishlamasdi
 * — anchor sana bo'lgani uchun joriy mavzuni bugungi kun bilan belgilash
 * rejani o'zi turgan joyiga qadardi. Batafsil: `lib/calendar/position.ts`.
 */

export type ProgressError = "invalid" | "topilmadi" | "chegara";
export type ProgressResult = { ok: true } | { ok: false; error: ProgressError };
export type ShiftResult =
  | { ok: true; currentTopicId: string | null }
  | { ok: false; error: ProgressError };

const PROGRESS_PATHS = ["/[locale]/ish", "/[locale]/ish/rejam"];

function revalidateProgress(): void {
  for (const path of PROGRESS_PATHS) revalidatePath(path, "page");
}

const markSchema = z.object({
  teachingClassId: z.string().min(1).max(64),
  topicId: z.string().min(1).max(64),
  /** Bo'sh — bugun (Toshkent kalendar kuni). */
  taughtOn: isoDate.optional(),
});

const shiftSchema = z.object({
  teachingClassId: z.string().min(1).max(64),
  direction: z.enum(["forward", "backward"]),
});

/**
 * Sinf o'qituvchiniki va TIRIK ekanini tekshiradi.
 *
 * `null` — "topilmadi" (begona `id` ni tekshirib ko'rib bo'lmasligi uchun
 * "ruxsat" EMAS).
 */
function findOwnedClass(userId: string, teachingClassId: string) {
  return prisma.teachingClass.findFirst({
    where: { id: teachingClassId, userId, deletedAt: null },
    select: {
      id: true,
      subjectId: true,
      grade: true,
      lessonsPerWeek: true,
      academicYearId: true,
      topicOffset: true,
    },
  });
}

export async function markTopicTaught(input: unknown): Promise<ProgressResult> {
  const user = await requireOnboarded();
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { teachingClassId, topicId } = parsed.data;

  const klass = await findOwnedClass(user.id, teachingClassId);
  if (!klass) return { ok: false, error: "topilmadi" };

  // Mavzu SINFNING fani va sinf raqamiga tegishli bo'lishi SHART. Usiz
  // o'qituvchi 7-A ni 11-sinf kimyo mavzusiga bog'lay olardi va `placeTopics`
  // anchor'ni JIMGINA e'tiborsiz qoldirardi (`anchorApplied: false`) — ya'ni
  // tugma bosiladi, hech narsa o'zgarmaydi, xato ham chiqmaydi.
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, subjectId: klass.subjectId, grade: klass.grade, deletedAt: null },
    select: { id: true },
  });
  if (!topic) return { ok: false, error: "topilmadi" };

  const taughtOn = parsed.data.taughtOn ?? schoolDay(new Date());

  await prisma.topicProgress.upsert({
    where: { teachingClassId_topicId: { teachingClassId, topicId } },
    create: { teachingClassId, topicId, status: "DONE", taughtOn },
    update: { status: "DONE", taughtOn },
  });

  revalidateProgress();
  return { ok: true };
}

/**
 * Sinfning KO'RSATKICHINI bir mavzu oldinga yoki orqaga suradi.
 *
 * FAQAT `TeachingClass.topicOffset` o'zgaradi. `TopicProgress` ga TEGILMAYDI
 * — u tarix/audit ("qaysi mavzuni qachon o'tdik"), bu esa ko'rsatkich
 * ("hozir qayerdamiz"). Ikkalasi bir-biriga qo'shilib ketmasligi kerak:
 * `lib/calendar/position.ts` dagi "UCH XIL NARSA" izohiga qarang.
 *
 * CHEGARA haqiqiy mavzular ro'yxatiga qarab qisiladi — birinchi mavzudan
 * oldinga ham, oxirgisidan keyinga ham chiqib bo'lmaydi. Tekshiruv
 * YOZISHDAN OLDIN, shuning uchun chegarada hech narsa yozilmaydi va
 * `revalidatePath` ham chaqirilmaydi.
 *
 * Chegara UI dagi tugma holati bilan BIR XIL manbadan: ikkalasi ham
 * `positionForClass` ning `previousTopicId`/`nextTopicId` ini o'qiydi, ya'ni
 * "tugma faol, lekin server rad etadi" holati yuzaga kelmaydi.
 */
export async function shiftClassPosition(input: unknown): Promise<ShiftResult> {
  const user = await requireOnboarded();
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { teachingClassId, direction } = parsed.data;

  const klass = await findOwnedClass(user.id, teachingClassId);
  if (!klass) return { ok: false, error: "topilmadi" };

  const [year] = await prisma.academicYear.findMany({
    where: { id: klass.academicYearId },
    take: 1,
    select: {
      quarters: {
        orderBy: { number: "asc" },
        select: { number: true, startsOn: true, endsOn: true },
      },
      holidays: {
        // Viloyat filtri SO'ROVDA: `placement.ts` sof funksiya, u tayyor ta'til
        // ro'yxatini oladi (`ish/rejam/page.tsx` naqshi).
        where: {
          deletedAt: null,
          ...(user.region
            ? {
                OR: [
                  { scope: "GLOBAL" as const },
                  { scope: "REGION" as const, region: user.region },
                ],
              }
            : { scope: "GLOBAL" as const }),
        },
        select: { startsOn: true, endsOn: true },
      },
    },
  });

  const topicRows = await prisma.topic.findMany({
    where: { subjectId: klass.subjectId, grade: klass.grade, deletedAt: null },
    // `slug` ikkinchi mezon SHART — CSV'da `order` takrorlanadi va Postgres
    // teng qiymatlarda tartibni kafolatlamaydi.
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: { id: true, parentId: true, order: true, slug: true, quarter: true, hoursPlan: true },
  });
  const sequenced = flattenTopicTree(topicRows);
  if (sequenced.length === 0) return { ok: false, error: "topilmadi" };

  // Kalibrovka (rejaning sanalari) — tarixdan. Ko'rsatkichni surmaydi.
  const anchorRow = await prisma.topicProgress.findFirst({
    where: { teachingClassId, status: "DONE", taughtOn: { not: null } },
    orderBy: [{ taughtOn: "desc" }, { createdAt: "desc" }],
    select: { topicId: true, taughtOn: true },
  });

  const slots = await prisma.scheduleSlot.findMany({
    where: { teachingClassId, deletedAt: null },
    select: { weekday: true },
  });

  const position = positionForClass({
    quarters: year?.quarters ?? [],
    holidays: year?.holidays ?? [],
    topics: sequenced,
    lessonsPerWeek: klass.lessonsPerWeek,
    weekdays: slots.map((slot) => slot.weekday),
    anchor: anchorRow?.taughtOn
      ? { topicId: anchorRow.topicId, taughtOn: anchorRow.taughtOn }
      : undefined,
    topicOffset: klass.topicOffset,
    today: schoolDay(new Date()),
  });

  // CHEGARA — YOZISHDAN OLDIN. Manba UI dagi tugma holati bilan BIR XIL.
  const target = direction === "forward" ? position.nextTopicId : position.previousTopicId;
  if (target === null) return { ok: false, error: "chegara" };

  await prisma.teachingClass.update({
    where: { id: teachingClassId },
    data: { topicOffset: klass.topicOffset + (direction === "forward" ? 1 : -1) },
  });

  revalidateProgress();
  return { ok: true, currentTopicId: target };
}
