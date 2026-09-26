import {
  CalendarEditor,
  type HolidayData,
  type QuarterData,
  type YearData,
} from "@/components/admin/calendar-editor";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * O'quv yili kalendari: yil, 4 chorak, ta'til va bayramlar.
 *
 * Bu sahifadagi sanalar butun mahsulotning hisob asosidir — "Rejam" sahifasi
 * mavzular sanasini shu yerdan oladi (`lib/calendar/placement.ts`).
 *
 * TANLOV: hozircha faqat FAOL yil tahrirlanadi. Bir nechta yilni parallel
 * boshqarish UI'si ataylab yozilmadi — beta boshlanganda bitta yil bo'ladi,
 * va ortiqcha tanlagich admin xatosiga yo'l ochardi.
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno).
 */

/** Sanalar bazada UTC yarim kecha (server/calendar-actions.ts shartnomasi). */
function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function AdminCalendarPage() {
  await requireAdmin();

  // `findFirst` YETARLI EMAS: bitta xato UPDATE ikkita faol yil qoldirsa u
  // tasodifiy birini olib jimgina noto'g'ri reja berardi. Tartib aniq.
  const [year] = await prisma.academicYear.findMany({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: {
      id: true,
      label: true,
      startsOn: true,
      endsOn: true,
      isActive: true,
      quarters: {
        orderBy: { number: "asc" },
        select: { number: true, startsOn: true, endsOn: true },
      },
      holidays: {
        where: { deletedAt: null },
        orderBy: { startsOn: "asc" },
        select: {
          id: true,
          label: true,
          startsOn: true,
          endsOn: true,
          scope: true,
          region: true,
        },
      },
    },
  });

  const yearData: YearData | null = year
    ? {
        id: year.id,
        label: year.label,
        startsOn: toInputDate(year.startsOn),
        endsOn: toInputDate(year.endsOn),
        isActive: year.isActive,
      }
    : null;

  const quarters: QuarterData[] = (year?.quarters ?? []).map((quarter) => ({
    number: quarter.number,
    startsOn: toInputDate(quarter.startsOn),
    endsOn: toInputDate(quarter.endsOn),
  }));

  const holidays: HolidayData[] = (year?.holidays ?? []).map((holiday) => ({
    id: holiday.id,
    label: holiday.label,
    startsOn: toInputDate(holiday.startsOn),
    endsOn: toInputDate(holiday.endsOn),
    scope: holiday.scope,
    region: holiday.region,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">Kalendar</h2>
        <p className="text-sm text-ink-2">
          {yearData
            ? "Faol o'quv yili tahrirlanadi. O'zgarish darhol \"Rejam\" sahifasidagi sanalarga ta'sir qiladi."
            : "Hali o'quv yili kiritilmagan. Avval yilni saqlang, keyin choraklar va ta'tillar ochiladi."}
        </p>
      </div>

      <CalendarEditor year={yearData} quarters={quarters} holidays={holidays} />
    </div>
  );
}
