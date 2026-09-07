"use client";

import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { saveGrades } from "@/server/onboarding-actions";
import { SelectableChip } from "./selectable-chip";

export function GradesStep({
  grades,
  initialSelected,
  gradeLabel,
  continueLabel,
  backLabel,
  errorLabel,
}: {
  grades: readonly number[];
  initialSelected: number[];
  /** `(grade: number) => string` — `Onboarding.grades.gradeLabel` allaqachon interpolatsiya qilingan holda kelmaydi, chunki har raqam uchun boshqa qiymat kerak. */
  gradeLabel: (grade: number) => string;
  continueLabel: string;
  backLabel: string;
  errorLabel: string;
}) {
  const [selected, setSelected] = useState<number[]>(initialSelected);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(grade: number) {
    setError(false);
    setSelected((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade],
    );
  }

  function handleContinue() {
    startTransition(async () => {
      const result = await saveGrades({ grades: selected });
      if (result.ok) router.push("/onboarding/viloyat");
      else setError(true);
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {grades.map((grade) => (
          <SelectableChip key={grade} selected={selected.includes(grade)} onClick={() => toggle(grade)}>
            {gradeLabel(grade)}
          </SelectableChip>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {errorLabel}
        </p>
      )}

      <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-line bg-paper py-4">
        <Link href="/onboarding/fanlar" className={buttonVariants({ variant: "outline" })}>
          {backLabel}
        </Link>
        <Button
          onClick={handleContinue}
          disabled={selected.length === 0 || pending}
          className="flex-1"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
