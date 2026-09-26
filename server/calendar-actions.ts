"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UZ_REGION_CODES } from "@/lib/uz-regions";

/**
 * O'quv yili kalendari action'lari (docs/sessions/07 — kalendar va TMR).
 *
 * Tartib: `"use server"` -> `requireAdmin()` -> Zod -> yozish ->
 * `revalidatePath`. Auth validatsiyadan OLDIN (CLAUDE.md 6-qoida).
 *
 * DIQQAT: `app/[locale]/admin/layout.tsx` dagi qorovul bu action'larni
 * HIMOYA QILMAYDI — server action POST'i layout'dan o'tmaydi. Shuning uchun
 * har biri o'zi `requireAdmin()` chaqiradi, birinchi await sifatida.
 *
 * SANA SHARTNOMASI: barcha kalendar sanalari **UTC yarim kecha** bo'lib
 * yoziladi. `lib/calendar/placement.ts` sanalarni `getUTC*` bilan o'qiydi,
 * shuning uchun mahalliy yarim kecha (Toshkentda UTC'ning oldingi kuni
 * 19:00) yozilsa butun reja bir kunga siljirdi. Sxemada `@db.Date` yo'q,
 * ya'ni bu shartnomani faqat shu fayl saqlaydi.
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno), shuning
 * uchun xato kodlari ham shu yerda qisqa satr.
 */

export type CalendarError = "invalid" | "topilmadi" | "sana" | "band";
export type CalendarResult = { ok: true } | { ok: false; error: CalendarError };
export type SaveYearResult = { ok: true; id: string } | { ok: false; error: CalendarError };

const CALENDAR_PATHS = ["/[locale]/admin/kalendar", "/[locale]/ish/rejam"];

function revalidateCalendar(): void {
  for (const path of CALENDAR_PATHS) revalidatePath(path, "page");
}

/**
 * `<input type="date">` "YYYY-MM-DD" beradi. UTC yarim kechaga aylantiramiz
 * (yuqoridagi sana shartnomasi).
 *
 * TESKARI TEKSHIRUV SHART: mavjud bo'lmagan sanani JS `Invalid Date` QILMAYDI
 * — `2027-02-31` JIMGINA `2027-03-03` ga aylanadi. Faqat oy 13 bo'lganda
 * `NaN` chiqadi. Shuning uchun aylantirilgan sana teskari yozilganda aynan
 * o'sha satr berishi tekshiriladi, aks holda admin terish xatosi boshqa
 * sanaga aylanib ketardi.
 */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "sana YYYY-MM-DD shaklida bo'lishi kerak")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "sana haqiqiy emas")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const yearSchema = z.object({
  /** Bo'sh — yangi yil yaratiladi. */
  id: z.string().min(1).max(64).optional(),
  label: z.string().trim().min(4).max(32),
  startsOn: isoDate,
  endsOn: isoDate,
  isActive: z.boolean(),
});

const quartersSchema = z.object({
  academicYearId: z.string().min(1).max(64),
  quarters: z
    .array(
      z.object({
        number: z.number().int().min(1).max(4),
        startsOn: isoDate,
        endsOn: isoDate,
      }),
    )
    .min(1)
    .max(4),
});

const holidaySchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    academicYearId: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(120),
    startsOn: isoDate,
    endsOn: isoDate,
    scope: z.enum(["GLOBAL", "REGION"]),
    region: z.enum(UZ_REGION_CODES).nullable(),
  })
  // Ikki tomonlama: REGION viloyatsiz bo'lsa hisob uni GLOBAL kabi ko'rib
  // butun mamlakat rejasini siljitardi; GLOBAL viloyat bilan bo'lsa esa
  // qaysi biri ustun ekani noaniq qolardi. Ikkovi ham jimgina noto'g'ri.
  .refine(
    (value) => (value.scope === "REGION" ? value.region !== null : value.region === null),
    "REGION uchun viloyat majburiy, GLOBAL uchun bo'sh bo'lishi kerak",
  );

const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Ikki chegara ham kiradi, ya'ni bir kunlik oraliq to'g'ri. */
function withinRange(inner: { startsOn: Date; endsOn: Date }, outer: { startsOn: Date; endsOn: Date }) {
  return inner.startsOn >= outer.startsOn && inner.endsOn <= outer.endsOn;
}

/**
 * Choraklar tartibi: `number` bo'yicha saralanganda sanalar ham o'sib
 * borishi va kesishmasligi kerak. Kesishgan chorak `placement.ts` da bir
 * kunni ikki chorakka tegishli qilardi — nomzod kunlar ikkilanardi.
 */
function quartersConsistent(quarters: { number: number; startsOn: Date; endsOn: Date }[]): boolean {
  const numbers = new Set(quarters.map((quarter) => quarter.number));
  if (numbers.size !== quarters.length) return false;
  if (quarters.some((quarter) => quarter.startsOn > quarter.endsOn)) return false;

  const sorted = [...quarters].sort((a, b) => a.number - b.number);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) return false;
    if (previous.endsOn >= current.startsOn) return false;
  }
  return true;
}

/**
 * O'quv yilini yaratadi yoki tahrirlaydi.
 *
 * `isActive: true` berilsa qolgan yillar bitta tranzaksiyada `false` qilinadi
 * — "faqat bitta faol yil" sharti partial unique indeks talab qiladi va u
 * Prisma sxemasida yozilmaydi, shuning uchun shartni shu yer saqlaydi.
 */
export async function saveAcademicYear(input: unknown): Promise<SaveYearResult> {
  await requireAdmin();
  const parsed = yearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { id, label, startsOn, endsOn, isActive } = parsed.data;
  if (startsOn > endsOn) return { ok: false, error: "sana" };

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const year = id
        ? await tx.academicYear.update({
            where: { id },
            data: { label, startsOn, endsOn, isActive },
            select: { id: true },
          })
        : await tx.academicYear.create({
            data: { label, startsOn, endsOn, isActive },
            select: { id: true },
          });

      if (isActive) {
        await tx.academicYear.updateMany({
          where: { id: { not: year.id }, isActive: true },
          data: { isActive: false },
        });
      }
      return year;
    });

    revalidateCalendar();
    return { ok: true, id: saved.id };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return { ok: false, error: "band" };
    if (code === "P2025") return { ok: false, error: "topilmadi" };
    throw error;
  }
}

/**
 * Choraklarni yozadi.
 *
 * `deleteMany` + `createMany` ATAYLAB ishlatilmaydi (CLAUDE.md: hech qachon
 * `delete`) — `@@unique([academicYearId, number])` bor, shuning uchun har
 * chorak `upsert` bilan yangilanadi. Yon foydasi: chorak `id` si saqlanadi.
 */
export async function saveQuarters(input: unknown): Promise<CalendarResult> {
  await requireAdmin();
  const parsed = quartersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { academicYearId, quarters } = parsed.data;

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { startsOn: true, endsOn: true },
  });
  if (!year) return { ok: false, error: "topilmadi" };

  if (!quartersConsistent(quarters)) return { ok: false, error: "sana" };
  if (quarters.some((quarter) => !withinRange(quarter, year))) return { ok: false, error: "sana" };

  await prisma.$transaction(
    quarters.map((quarter) =>
      prisma.quarter.upsert({
        where: { academicYearId_number: { academicYearId, number: quarter.number } },
        create: { academicYearId, ...quarter },
        update: { startsOn: quarter.startsOn, endsOn: quarter.endsOn },
      }),
    ),
  );

  revalidateCalendar();
  return { ok: true };
}

/** Chorak ichidagi ta'til/bayramni yozadi. */
export async function saveHoliday(input: unknown): Promise<CalendarResult> {
  await requireAdmin();
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { id, academicYearId, label, startsOn, endsOn, scope, region } = parsed.data;
  if (startsOn > endsOn) return { ok: false, error: "sana" };

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { startsOn: true, endsOn: true },
  });
  if (!year) return { ok: false, error: "topilmadi" };
  if (!withinRange({ startsOn, endsOn }, year)) return { ok: false, error: "sana" };

  const data = { academicYearId, label, startsOn, endsOn, scope, region };

  if (id) {
    // O'chirilgan ta'til tahrirlanmaydi — `updateMany` + `deletedAt: null`
    // shartini bitta so'rovda bajaradi.
    const updated = await prisma.holiday.updateMany({ where: { id, deletedAt: null }, data });
    if (updated.count === 0) return { ok: false, error: "topilmadi" };
  } else {
    await prisma.holiday.create({ data, select: { id: true } });
  }

  revalidateCalendar();
  return { ok: true };
}

/** Soft delete (CLAUDE.md: hech qachon `delete`). */
export async function deleteHoliday(input: unknown): Promise<CalendarResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const deleted = await prisma.holiday.updateMany({
    where: { id: parsed.data.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (deleted.count === 0) return { ok: false, error: "topilmadi" };

  revalidateCalendar();
  return { ok: true };
}
