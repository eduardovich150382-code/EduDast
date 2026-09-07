"use client";

import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import type { UzRegionCode } from "@/lib/uz-regions";
import { saveRegion } from "@/server/onboarding-actions";
import { SelectableChip } from "./selectable-chip";

export function RegionStep({
  regions,
  initialSelected,
  finishLabel,
  backLabel,
  errorLabel,
}: {
  regions: { code: UzRegionCode; name: string }[];
  initialSelected: UzRegionCode | null;
  finishLabel: string;
  backLabel: string;
  errorLabel: string;
}) {
  const [selected, setSelected] = useState<UzRegionCode | null>(initialSelected);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleFinish() {
    if (!selected) return;
    startTransition(async () => {
      // Muvaffaqiyatda server /ish ga yo'naltiradi (redirect() throw
      // qiladi) — shu sabab `result` faqat XATO holatida qaytadi.
      const result = await saveRegion({ region: selected });
      if (result && !result.ok) setError(true);
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {regions.map((region) => (
          <SelectableChip
            key={region.code}
            selected={selected === region.code}
            onClick={() => {
              setError(false);
              setSelected(region.code);
            }}
          >
            {region.name}
          </SelectableChip>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {errorLabel}
        </p>
      )}

      <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-line bg-paper py-4">
        <Link href="/onboarding/sinflar" className={buttonVariants({ variant: "outline" })}>
          {backLabel}
        </Link>
        <Button onClick={handleFinish} disabled={!selected || pending} className="flex-1">
          {finishLabel}
        </Button>
      </div>
    </div>
  );
}
