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
 * MA'LUM CHEKLOV — `shiftClassPosition` "oldinga": anchor SANA, indeks emas.
 * `placement.ts` dagi `anchorShift` `delta` ni `Math.max(0, …)` bilan qisadi,
 * ya'ni rejadan OLDINDA ketayotgan sinfda › bosilsa "o'tdim" yoziladi, lekin
 * ko'rinadigan joriy mavzu SILJIMAYDI (reja allaqachon bu mavzuni keyinroq
 * tugatishni mo'ljallagan). Rejada yoki orqada turgan sinflarda — to'g'ri
 * ishlaydi. Tuzatish `TeachingClass.topicOffset` ustunini talab qiladi, u esa
 * spek sxemasida yo'q. Qarz: `docs/qarzlar-kechiktirilgan.md`.
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
    select: { id: true, subjectId: true, grade: true, lessonsPerWeek: true, academicYearId: true },
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
 * Sinfni bir mavzu oldinga yoki orqaga suradi.
 *
 * Sxemada "pozitsiya" ustuni YO'Q — sinfning turgan joyi oxirgi `DONE`
 * `TopicProgress` qatoridan kelib chiqadi. Shuning uchun:
 * - **oldinga** = "joriy mavzuni tugatdik" -> `DONE` yoziladi;
 * - **orqaga** = "yo'q, hali tugatmadik" -> oxirgi `DONE` `PLANNED` ga
 *   qaytariladi. Anchor so'rovi `status: DONE` bo'yicha filtrlaydi, ya'ni qator
 *   tushib qolgach reja O'ZI oldingi `DONE` nuqtadan QAYTA hisoblanadi.
 *
 * Chegaralar HAR IKKISI YOZISHDAN OLDIN tekshiriladi, shuning uchun chegarada
 * hech narsa yozilmaydi va `revalidatePath` ham chaqirilmaydi.
 */
export async function shiftClassPosition(input: unknown): Promise<ShiftResult> {
  const user = await requireOnboarded();
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { teachingClassId, direction } = parsed.data;

  const klass = await findOwnedClass(user.id, teachingClassId);
  if (!klass) return { ok: false, error: "topilmadi" };

  // ORQAGA — hisob umuman kerak emas: oxirgi `DONE` qatorni `PLANNED` ga
  // qaytarish yetarli. `taughtOn: null` — sxemadagi invariantni saqlash uchun.
  if (direction === "backward") {
    const latest = await prisma.topicProgress.findFirst({
      where: { teachingClassId, status: "DONE" },
      orderBy: [{ taughtOn: "desc" }, { createdAt: "desc" }],
      select: { id: true, topicId: true },
    });
    // CHEGARA: birinchi mavzudan orqaga yo'l yo'q.
    if (!latest) return { ok: false, error: "chegara" };

    // Qator O'CHIRILMAYDI (CLAUDE.md) — `createdAt` "bir vaqtlar shu yerda
    // edik" izi bo'lib qoladi.
    await prisma.topicProgress.update({
      where: { id: latest.id },
      data: { status: "PLANNED", taughtOn: null },
    });

    revalidateProgress();
    // Qaytarilgan mavzu endi JORIY bo'ladi — qayta hisob kerak emas.
    return { ok: true, currentTopicId: latest.topicId };
  }

  // OLDINGA — joriy mavzuni bilish kerak, ya'ni to'liq hisob.
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

  // CHEGARA — YOZISHDAN OLDIN: oxirgi mavzu allaqachon `DONE` bo'lsa oldinga
  // suriladigan joy yo'q.
  const lastTopicId = sequenced[sequenced.length - 1]!.id;
  const lastDone = await prisma.topicProgress.findFirst({
    where: { teachingClassId, topicId: lastTopicId, status: "DONE" },
    select: { id: true },
  });
  if (lastDone) return { ok: false, error: "chegara" };

  const anchorRow = await prisma.topicProgress.findFirst({
    where: { teachingClassId, status: "DONE", taughtOn: { not: null } },
    orderBy: [{ taughtOn: "desc" }, { createdAt: "desc" }],
    select: { topicId: true, taughtOn: true },
  });

  const slots = await prisma.scheduleSlot.findMany({
    where: { teachingClassId, deletedAt: null },
    select: { weekday: true },
  });

  const today = schoolDay(new Date());
  const position = positionForClass({
    quarters: year?.quarters ?? [],
    holidays: year?.holidays ?? [],
    topics: sequenced,
    lessonsPerWeek: klass.lessonsPerWeek,
    weekdays: slots.map((slot) => slot.weekday),
    anchor: anchorRow?.taughtOn
      ? { topicId: anchorRow.topicId, taughtOn: anchorRow.taughtOn }
      : undefined,
    today,
  });

  // Reja hali boshlanmagan bo'lsa birinchi mavzu "tugadi" deb belgilanadi.
  const targetId = position.currentTopicId ?? sequenced[0]!.id;

  await prisma.topicProgress.upsert({
    where: { teachingClassId_topicId: { teachingClassId, topicId: targetId } },
    create: { teachingClassId, topicId: targetId, status: "DONE", taughtOn: today },
    update: { status: "DONE", taughtOn: today },
  });

  revalidateProgress();
  const index = sequenced.findIndex((topic) => topic.id === targetId);
  return { ok: true, currentTopicId: sequenced[index + 1]?.id ?? targetId };
}
