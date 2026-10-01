"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_GRADE, MIN_GRADE } from "@/lib/grades";

/**
 * Sinflar action'lari (docs/sessions/09-dars-jadvali.md, 2-band).
 *
 * Tartib: `"use server"` -> `requireOnboarded()` -> Zod -> egalik tekshiruvi ->
 * yozish -> `revalidatePath`. Auth BIRINCHI await (CLAUDE.md 6-qoida) —
 * kirmagan chaqiruvchi sxema haqida hech narsa bilmasligi uchun.
 *
 * NEGA `requireOnboarded`, `requireAuth` EMAS: fan `user.subjects`, sinf
 * raqami `user.grades` bo'yicha tekshiriladi, ular esa onboarding'da
 * to'ldiriladi. Onboarding tugamagan foydalanuvchida ikkala ro'yxat ham bo'sh
 * bo'lib, HAR urinish "ruxsat" bilan rad etilardi va sababi ko'rinmasdi
 * (`server/generation-actions.ts` naqshi). `requireOnboarded` ichida
 * `requireAuth()` ni chaqiradi, ya'ni "auth birinchi" sharti saqlanadi.
 */

export type ClassError = "invalid" | "topilmadi" | "ruxsat" | "band";
export type SaveClassResult = { ok: true; id: string } | { ok: false; error: ClassError };
export type ClassResult = { ok: true } | { ok: false; error: ClassError };

/**
 * Sinf harflari — YOPIQ ro'yxat.
 *
 * Erkin satr bo'lsa lotin "A" va kirill "А" ikki xil sinf bo'lib qolardi va
 * `@@unique` ularni ajrata olmasdi: o'qituvchi ro'yxatda ikkita "7-A" ko'rib,
 * nega ikkitasi borligini tushunmasdi.
 *
 * "" — harfsiz sinf (maktabda bitta 7-sinf bo'lsa).
 */
export const CLASS_LABELS = ["", "A", "B", "V", "G", "D"] as const;

/** 1 — minimal; 12 — haftada har kuni ikki soatdan ham ko'p, ya'ni xato. */
const MIN_LESSONS_PER_WEEK = 1;
const MAX_LESSONS_PER_WEEK = 12;

const CLASS_PATHS = ["/[locale]/ish", "/[locale]/ish/sinflarim", "/[locale]/ish/jadval"];

function revalidateClasses(): void {
  for (const path of CLASS_PATHS) revalidatePath(path, "page");
}

const classSchema = z.object({
  /** Bo'sh — yangi sinf yaratiladi. */
  id: z.string().min(1).max(64).optional(),
  /** `User.subjects` da SLUG turadi, shuning uchun kirish ham slug. */
  subjectSlug: z.string().min(1).max(64),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE),
  label: z.enum(CLASS_LABELS),
  lessonsPerWeek: z.number().int().min(MIN_LESSONS_PER_WEEK).max(MAX_LESSONS_PER_WEEK),
});

const idSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Sinf yaratadi yoki tahrirlaydi.
 *
 * `academicYearId` KIRISHDAN OLINMAYDI — faol yil serverda hal qilinadi. Aks
 * holda qo'lda yasalgan payload sinfni o'tgan yilga yopishtirib, bosh sahifani
 * JIMGINA bo'shatib qo'yardi.
 */
export async function saveTeachingClass(input: unknown): Promise<SaveClassResult> {
  const user = await requireOnboarded();
  const parsed = classSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { id, subjectSlug, grade, label, lessonsPerWeek } = parsed.data;

  // Ruxsat: o'qituvchi FAQAT o'zi tanlagan fan va sinf bo'yicha sinf ochadi
  // (`saveSubjects` naqshi). Tekshirilmasa bitta hisob butun kurikulum bo'yicha
  // sinf yaratib, bosh sahifani so'rovlar manbaiga aylantirardi.
  if (!user.subjects.includes(subjectSlug) || !user.grades.includes(grade)) {
    return { ok: false, error: "ruxsat" };
  }

  const subject = await prisma.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true },
  });
  if (!subject) return { ok: false, error: "topilmadi" };

  // `findFirst` YETARLI EMAS: xato UPDATE ikkita faol yil qoldirsa u tasodifiy
  // birini olib sinfni noto'g'ri yilga bog'lardi (`ish/rejam/page.tsx` naqshi).
  const [year] = await prisma.academicYear.findMany({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: { id: true },
  });
  if (!year) return { ok: false, error: "topilmadi" };

  try {
    if (id) {
      // Egalik BITTA so'rovda: `userId` where ichida. Begona sinf — `count: 0`,
      // ya'ni "topilmadi". ATAYLAB "ruxsat" EMAS: farqli javob begona `id` ni
      // tekshirib ko'rish imkonini berardi.
      const updated = await prisma.teachingClass.updateMany({
        where: { id, userId: user.id, deletedAt: null },
        data: { subjectId: subject.id, grade, label, lessonsPerWeek, academicYearId: year.id },
      });
      if (updated.count === 0) return { ok: false, error: "topilmadi" };

      revalidateClasses();
      return { ok: true, id };
    }

    // `create` EMAS, `upsert`: `@@unique` O'CHIRILGAN qatorni ham qamraydi,
    // ya'ni "7-A" ni o'chirib qayta qo'shish `P2002` berardi. `upsert` eskisini
    // TIRILTIRADI va unga bog'langan `ScheduleSlot`/`TopicProgress` saqlanib
    // qoladi (`server/calendar-actions.ts` `saveQuarters` bilan bir xil qaror).
    const saved = await prisma.teachingClass.upsert({
      where: {
        userId_subjectId_grade_label_academicYearId: {
          userId: user.id,
          subjectId: subject.id,
          grade,
          label,
          academicYearId: year.id,
        },
      },
      create: {
        userId: user.id,
        subjectId: subject.id,
        grade,
        label,
        lessonsPerWeek,
        academicYearId: year.id,
      },
      update: { lessonsPerWeek, deletedAt: null },
      select: { id: true },
    });

    revalidateClasses();
    return { ok: true, id: saved.id };
  } catch (error) {
    // Tahrir sinfni MAVJUD bo'lganiga aylantirsa (7-A -> 7-B, 7-B esa bor).
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "band" };
    // Kutilmagan xato ATAYLAB yuqoriga (`server/credit-actions.ts` naqshi).
    throw error;
  }
}

/**
 * Soft delete (CLAUDE.md: hech qachon `delete`).
 *
 * `ScheduleSlot` va `TopicProgress` TEGILMAYDI: sinf tiriltirilsa jadval ham,
 * "qayerda turgan edik" ham joyida qoladi. Buning narxi — o'qiydigan HAR tomon
 * `teachingClass: { deletedAt: null }` ni QO'LDA yozishi shart.
 */
export async function deleteTeachingClass(input: unknown): Promise<ClassResult> {
  const user = await requireOnboarded();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const deleted = await prisma.teachingClass.updateMany({
    where: { id: parsed.data.id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (deleted.count === 0) return { ok: false, error: "topilmadi" };

  revalidateClasses();
  return { ok: true };
}
