"use client";

import { useState, useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleSubjectActive } from "@/server/admin-actions";

/**
 * Fanni "tayyor" (isActive) yoki "tez orada" qilib belgilaydi.
 *
 * Optimistik EMAS: server javobidan keyin holat o'zgaradi. Bu tugma kamdan
 * kam bosiladi va noto'g'ri ko'rsatilgan holat (onboarding'da qaysi fan
 * ochiq) chalg'itadi.
 */
export function SubjectActiveToggle({
  slug,
  isActive,
}: {
  slug: string;
  isActive: boolean;
}) {
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-warn">Saqlanmadi</span>}
      <Button
        variant={active ? "secondary" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(false);
          startTransition(async () => {
            const next = !active;
            const result = await toggleSubjectActive({ slug, isActive: next });
            if (result.ok) setActive(next);
            else setError(true);
          });
        }}
      >
        {active ? (
          <>
            <Check className="size-3.5" strokeWidth={1.5} />
            Faol
          </>
        ) : (
          <>
            <Clock className="size-3.5" strokeWidth={1.5} />
            Tez orada
          </>
        )}
      </Button>
    </div>
  );
}
