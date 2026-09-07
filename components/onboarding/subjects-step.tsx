"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { saveSubjects } from "@/server/onboarding-actions";
import { SelectableChip } from "./selectable-chip";

export type SubjectOption = { slug: string; name: string; isActive: boolean };

export function SubjectsStep({
  subjects,
  initialSelected,
  continueLabel,
  comingSoonLabel,
  emptyLabel,
  errorLabel,
}: {
  subjects: SubjectOption[];
  initialSelected: string[];
  continueLabel: string;
  comingSoonLabel: string;
  emptyLabel: string;
  errorLabel: string;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(slug: string) {
    setError(false);
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleContinue() {
    startTransition(async () => {
      const result = await saveSubjects({ subjects: selected });
      if (result.ok) router.push("/onboarding/sinflar");
      else setError(true);
    });
  }

  if (subjects.length === 0) {
    return <p className="text-sm text-ink-2">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {subjects.map((subject) => (
          <SelectableChip
            key={subject.slug}
            selected={selected.includes(subject.slug)}
            onClick={() => toggle(subject.slug)}
            badge={subject.isActive ? undefined : comingSoonLabel}
          >
            {subject.name}
          </SelectableChip>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {errorLabel}
        </p>
      )}

      <div className="sticky bottom-0 mt-auto border-t border-line bg-paper py-4">
        <Button
          onClick={handleContinue}
          disabled={selected.length === 0 || pending}
          className="w-full"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
