"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTeachingClass, saveTeachingClass } from "@/server/class-actions";
import { useRouter } from "@/lib/i18n/navigation";
import { MAX_LESSONS_PER_WEEK, MIN_LESSONS_PER_WEEK } from "@/lib/teaching";

/**
 * Sinflar ro'yxati va formasi (09-sessiya, 2-band).
 *
 * BARCHA MATN PROP SIFATIDA keladi: `gradeLabel` har sinf uchun boshqa matn
 * beradi, funksiyani esa client komponentga uzatib bo'lmaydi (RSC
 * serializatsiya qilmaydi, `tests/client-props-guard.test.ts` qorovuli).
 * Shuning uchun server tayyor `{ value, label }` ro'yxatini beradi —
 * `components/onboarding/grades-step.tsx` bilan bir xil naqsh.
 */

export type ClassRow = {
  id: string;
  subjectSlug: string;
  subjectName: string;
  grade: number;
  label: string;
  lessonsPerWeek: number;
};

type Option<T> = { value: T; label: string };

export type ClassesLabels = {
  add: string;
  subject: string;
  grade: string;
  letter: string;
  lessonsPerWeek: string;
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  empty: string;
  hoursTemplate: string;
  errors: Record<string, string>;
  genericError: string;
};

/**
 * Haftada necha soat — tanlov ro'yxati. Chegaralar `lib/teaching.ts` dan, ya'ni
 * forma va Zod validatsiyasi ajralib ketolmaydi.
 */
const LESSON_COUNTS = Array.from(
  { length: MAX_LESSONS_PER_WEEK - MIN_LESSONS_PER_WEEK + 1 },
  (_unused, index) => MIN_LESSONS_PER_WEEK + index,
);

type Draft = {
  id?: string;
  subjectSlug: string;
  grade: number;
  label: string;
  lessonsPerWeek: number;
};

export function ClassesManager({
  classes,
  subjects,
  grades,
  letters,
  labels,
}: {
  classes: ClassRow[];
  subjects: readonly Option<string>[];
  grades: readonly Option<number>[];
  letters: readonly Option<string>[];
  labels: ClassesLabels;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const firstSubject = subjects[0]?.value ?? "";
  const firstGrade = grades[0]?.value ?? 1;

  function openNew() {
    setError(null);
    setDraft({ subjectSlug: firstSubject, grade: firstGrade, label: "", lessonsPerWeek: 2 });
  }

  function openEdit(row: ClassRow) {
    setError(null);
    setDraft({
      id: row.id,
      subjectSlug: row.subjectSlug,
      grade: row.grade,
      label: row.label,
      lessonsPerWeek: row.lessonsPerWeek,
    });
  }

  /** Action xato kodini tarjimaga aylantiradi, noma'lum kod — umumiy matn. */
  function showError(code: string) {
    setError(labels.errors[code] ?? labels.genericError);
  }

  function handleSave() {
    if (!draft) return;
    startTransition(async () => {
      const result = await saveTeachingClass(draft);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setDraft(null);
      setError(null);
      // Ro'yxat server komponentda — qayta so'rash kerak.
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteTeachingClass({ id });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {classes.length === 0 && !draft ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {classes.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {row.subjectName} {row.grade}
                  {row.label ? `-${row.label}` : ""}
                </p>
                <p className="text-xs text-ink-2">
                  {labels.hoursTemplate.replace("{count}", String(row.lessonsPerWeek))}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.edit}
                  disabled={pending}
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="size-4" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.delete}
                  disabled={pending}
                  onClick={() => handleDelete(row.id)}
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-3 py-3">
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {labels.subject}
            <select
              value={draft.subjectSlug}
              onChange={(event) => setDraft({ ...draft, subjectSlug: event.target.value })}
              className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
            >
              {subjects.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {/* Telefonda uchta qisqa maydon bir qatorga sig'adi. */}
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-ink-2">
              {labels.grade}
              <select
                value={String(draft.grade)}
                onChange={(event) => setDraft({ ...draft, grade: Number(event.target.value) })}
                className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
              >
                {grades.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-ink-2">
              {labels.letter}
              <select
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
              >
                {letters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-ink-2">
              {labels.lessonsPerWeek}
              <select
                value={String(draft.lessonsPerWeek)}
                onChange={(event) =>
                  setDraft({ ...draft, lessonsPerWeek: Number(event.target.value) })
                }
                className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
              >
                {LESSON_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      {/* Yopishqoq pastki panel — onboarding naqshi (StepShell ichidagi oqim). */}
      <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-line bg-paper py-4">
        {draft ? (
          <>
            <Button variant="outline" disabled={pending} onClick={() => setDraft(null)}>
              {labels.cancel}
            </Button>
            <Button className="flex-1" disabled={pending} onClick={handleSave}>
              {labels.save}
            </Button>
          </>
        ) : (
          <Button className="w-full" disabled={pending || subjects.length === 0} onClick={openNew}>
            <Plus className="size-4" strokeWidth={1.5} />
            {labels.add}
          </Button>
        )}
      </div>
    </div>
  );
}
