"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  MAX_LESSON_NO,
  MAX_SLOTS,
  MAX_WEEKDAY,
  MIN_LESSON_NO,
  MIN_WEEKDAY,
} from "@/lib/teaching";

/**
 * Dars jadvali action'lari (docs/sessions/09-dars-jadvali.md, 3-band).
 *
 * BUTUN HAFTA BITTA PAYLOADDA: sahifa 6x8 to'rni to'liq yuboradi. Shu qaror
 * ikki muammoni birdan yopadi — ziddiyat (bir katakka ikki sinf) bazaga
 * bormasdan XOTIRADA aniqlanadi, va bir nechta katakni alohida saqlashda
 * paydo bo'ladigan "yarim jadval" holati umuman yuzaga kelmaydi.
 *
 * Tartib: `"use server"` -> `requireOnboarded()` -> Zod -> ziddiyat -> egalik
 * -> bitta tranzaksiya -> `revalidatePath`. Auth BIRINCHI await
 * (CLAUDE.md 6-qoida).
 */

export type ScheduleError = "invalid" | "topilmadi" | "band";
export type ScheduleResult = { ok: true } | { ok: false; error: ScheduleError };

const SCHEDULE_PATHS = ["/[locale]/ish", "/[locale]/ish/jadval"];

function revalidateSchedule(): void {
  for (const path of SCHEDULE_PATHS) revalidatePath(path, "page");
}

const slotsSchema = z.object({
  /** Bo'sh massiv — jadvalni butunlay tozalash (ruxsat etilgan holat). */
  slots: z
    .array(
      z.object({
        teachingClassId: z.string().min(1).max(64),
        weekday: z.number().int().min(MIN_WEEKDAY).max(MAX_WEEKDAY),
        lessonNo: z.number().int().min(MIN_LESSON_NO).max(MAX_LESSON_NO),
      }),
    )
    .max(MAX_SLOTS),
});

/**
 * O'qituvchining butun haftalik jadvalini almashtiradi.
 *
 * `lessonsPerWeek` va katak soni mosligi ATAYLAB tekshirilmaydi — spek uni
 * *ogohlantirish* deydi. Qattiq rad etish yarim kiritilgan jadvalni saqlashga
 * to'sqinlik qilardi, ya'ni o'qituvchi ishini yo'qotardi. Ogohlantirish
 * sahifada ko'rsatiladi.
 */
export async function saveScheduleSlots(input: unknown): Promise<ScheduleResult> {
  const user = await requireOnboarded();
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { slots } = parsed.data;

  // ZIDDIYAT — bazaga BORMASDAN. Butun hafta shu payloadda, demak takror katak
  // faqat shu massiv ichida bo'lishi mumkin.
  const cells = new Set<string>();
  for (const slot of slots) {
    const cell = `${slot.weekday}:${slot.lessonNo}`;
    if (cells.has(cell)) return { ok: false, error: "band" };
    cells.add(cell);
  }

  // EGALIK: payloaddagi HAR sinf o'qituvchiniki va tirik bo'lishi shart.
  const classIds = [...new Set(slots.map((slot) => slot.teachingClassId))];
  if (classIds.length > 0) {
    const owned = await prisma.teachingClass.findMany({
      where: { id: { in: classIds }, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== classIds.length) return { ok: false, error: "topilmadi" };
  }

  const now = new Date();

  // ATOMAR: bitta `$transaction` massivi. Avval o'qituvchining HAMMA katagi
  // o'chirilgan deb belgilanadi, keyin yangilari tiriltiriladi/yaratiladi.
  //
  // `deleteMany` + `createMany` ATAYLAB ISHLATILMADI (CLAUDE.md: hech qachon
  // `delete`) — `@@unique([teachingClassId, weekday, lessonNo])` bor, shuning
  // uchun `upsert` o'chirilgan qatorni QAYTA TIRILTIRADI va `id` saqlanadi
  // (`server/calendar-actions.ts` `saveQuarters` bilan bir xil qaror).
  //
  // TARTIB MUHIM: `updateMany` birinchi. Teskarisi bo'lsa yangi yozilgan katak
  // darhol o'chirilgan deb belgilanardi.
  await prisma.$transaction([
    prisma.scheduleSlot.updateMany({
      where: { teachingClass: { userId: user.id }, deletedAt: null },
      data: { deletedAt: now },
    }),
    ...slots.map((slot) =>
      prisma.scheduleSlot.upsert({
        where: {
          teachingClassId_weekday_lessonNo: {
            teachingClassId: slot.teachingClassId,
            weekday: slot.weekday,
            lessonNo: slot.lessonNo,
          },
        },
        create: { ...slot },
        update: { deletedAt: null },
        select: { id: true },
      }),
    ),
  ]);

  revalidateSchedule();
  return { ok: true };
}
