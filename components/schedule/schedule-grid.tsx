"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { LESSON_NUMBERS, WEEKDAYS } from "@/lib/teaching";
import { saveScheduleSlots } from "@/server/schedule-actions";

/**
 * 6 kun x 8 dars to'ri (09-sessiya, 3-band).
 *
 * MOBIL BIRINCHI: telefonda bir vaqtda BITTA kun ko'rinadi va kunlar orasida
 * ‹ › bilan o'tiladi; `sm:` dan yuqorida butun hafta jadval shaklida. Butun
 * hafta 48 katak — telefonda u o'qilmaydigan maydachalarga aylanardi.
 *
 * Butun to'r bitta `useState` da va bitta `saveScheduleSlots` chaqirig'i bilan
 * saqlanadi: action ham butun haftani kutadi, ya'ni "yarim jadval" holati
 * umuman yuzaga kelmaydi.
 *
 * BARCHA MATN PROP SIFATIDA (`tests/client-props-guard.test.ts`).
 */

export type ScheduleClass = {
  id: string;
  /** Ko'rinadigan nom: "Fizika 7-A". */
  name: string;
  /** Qisqa nom katak uchun: "7-A". */
  shortName: string;
  lessonsPerWeek: number;
};

export type ScheduleLabels = {
  save: string;
  saved: string;
  clear: string;
  chooseClass: string;
  close: string;
  prevDay: string;
  nextDay: string;
  lessonTemplate: string;
  mismatchTemplate: string;
  weekdays: Record<number, string>;
  weekdaysShort: Record<number, string>;
  errors: Record<string, string>;
  genericError: string;
};

/** `weekday:lessonNo` -> `teachingClassId`. Bo'sh katak — kalit yo'q. */
type Grid = Record<string, string>;

const cellKey = (weekday: number, lessonNo: number) => `${weekday}:${lessonNo}`;

export function ScheduleGrid({
  classes,
  initialSlots,
  labels,
}: {
  classes: ScheduleClass[];
  initialSlots: { teachingClassId: string; weekday: number; lessonNo: number }[];
  labels: ScheduleLabels;
}) {
  const [grid, setGrid] = useState<Grid>(() => {
    const initial: Grid = {};
    for (const slot of initialSlots) {
      initial[cellKey(slot.weekday, slot.lessonNo)] = slot.teachingClassId;
    }
    return initial;
  });
  // Telefonda ko'rinadigan kun. Dushanbadan boshlanadi.
  const [day, setDay] = useState(1);
  const [picking, setPicking] = useState<{ weekday: number; lessonNo: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byId = new Map(classes.map((item) => [item.id, item]));

  function assign(weekday: number, lessonNo: number, classId: string | null) {
    setError(null);
    setSaved(false);
    setGrid((previous) => {
      const next = { ...previous };
      // Bitta katakda bitta sinf — yozish eskisini ALMASHTIRADI, ya'ni
      // ziddiyat to'rning o'zida paydo bo'lmaydi.
      if (classId === null) delete next[cellKey(weekday, lessonNo)];
      else next[cellKey(weekday, lessonNo)] = classId;
      return next;
    });
    setPicking(null);
  }

  function handleSave() {
    const slots = Object.entries(grid).map(([key, teachingClassId]) => {
      const [weekday, lessonNo] = key.split(":");
      return { teachingClassId, weekday: Number(weekday), lessonNo: Number(lessonNo) };
    });

    startTransition(async () => {
      const result = await saveScheduleSlots({ slots });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.genericError);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  /** Sinfning jadvaldagi katak soni — ogohlantirish uchun. */
  function countFor(classId: string): number {
    return Object.values(grid).filter((value) => value === classId).length;
  }

  const mismatches = classes
    .map((item) => ({ item, actual: countFor(item.id) }))
    // Umuman qo'yilmagan sinf — hali kiritilmagan, ogohlantirish bermaymiz.
    .filter(({ item, actual }) => actual > 0 && actual !== item.lessonsPerWeek);

  function Cell({ weekday, lessonNo }: { weekday: number; lessonNo: number }) {
    const classId = grid[cellKey(weekday, lessonNo)];
    const assigned = classId ? byId.get(classId) : undefined;
    return (
      <button
        type="button"
        onClick={() => setPicking({ weekday, lessonNo })}
        className={
          assigned
            ? "h-11 w-full rounded-lg border border-transparent bg-accent-2 px-1 text-xs font-medium text-on-accent"
            : "h-11 w-full rounded-lg border border-line bg-surface px-1 text-xs text-ink-2 hover:bg-muted"
        }
      >
        {assigned ? assigned.shortName : "+"}
      </button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Mobil: bitta kun. */}
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={labels.prevDay}
            disabled={day === WEEKDAYS[0]}
            onClick={() => setDay((previous) => previous - 1)}
          >
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </Button>
          <span className="text-sm font-medium text-ink">{labels.weekdays[day]}</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={labels.nextDay}
            disabled={day === WEEKDAYS[WEEKDAYS.length - 1]}
            onClick={() => setDay((previous) => previous + 1)}
          >
            <ChevronRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {LESSON_NUMBERS.map((lessonNo) => (
            <li key={lessonNo} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-ink-2">
                {labels.lessonTemplate.replace("{number}", String(lessonNo))}
              </span>
              <div className="flex-1">
                <Cell weekday={day} lessonNo={lessonNo} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Kompyuter: butun hafta. */}
      <div className="hidden sm:block">
        <table className="w-full table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10" />
              {WEEKDAYS.map((weekday) => (
                <th key={weekday} className="pb-1 text-xs font-medium text-ink-2">
                  {labels.weekdaysShort[weekday]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LESSON_NUMBERS.map((lessonNo) => (
              <tr key={lessonNo}>
                <th className="text-right align-middle text-xs font-normal text-ink-2">
                  {lessonNo}
                </th>
                {WEEKDAYS.map((weekday) => (
                  <td key={weekday}>
                    <Cell weekday={weekday} lessonNo={lessonNo} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mismatches.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-warn/10 px-3 py-2">
          {mismatches.map(({ item, actual }) => (
            <p key={item.id} className="flex items-start gap-2 text-sm text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
              {labels.mismatchTemplate
                .replace("{name}", item.name)
                .replace("{actual}", String(actual))
                .replace("{expected}", String(item.lessonsPerWeek))}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 mt-auto flex items-center gap-3 border-t border-line bg-paper py-4">
        {saved && <span className="text-sm text-accent-2">{labels.saved}</span>}
        <Button className="flex-1" disabled={pending} onClick={handleSave}>
          {labels.save}
        </Button>
      </div>

      {/* Sinf tanlash — oddiy pastki varaq. `Dialog` ishlatilmadi: bu yerda
          fokus tuzog'i va animatsiya kerak emas, bitta ro'yxat yetarli. */}
      {picking && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/40">
          <div className="flex max-h-[70vh] w-full flex-col gap-2 overflow-y-auto rounded-t-xl border-t border-line bg-paper px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{labels.chooseClass}</p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={labels.close}
                onClick={() => setPicking(null)}
              >
                <X className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
            {classes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => assign(picking.weekday, picking.lessonNo, item.id)}
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm text-ink hover:bg-muted"
              >
                {item.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => assign(picking.weekday, picking.lessonNo, null)}
              className="rounded-lg border border-line px-3 py-2.5 text-left text-sm text-ink-2 hover:bg-muted"
            >
              {labels.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
