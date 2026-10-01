"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { shiftClassPosition } from "@/server/progress-actions";

/**
 * Mavzuni bir qadam oldinga/orqaga suradigan ‹ › tugmalari
 * (09-sessiya, 5-band).
 *
 * Chegara SERVERDA hal qilinadi (`shiftClassPosition` "chegara" qaytaradi),
 * lekin tugma `canBack`/`canForward` bilan oldindan ham o'chiriladi — ya'ni
 * o'qituvchi ishlamaydigan tugmani bosib, keyin xato o'qimaydi. Server
 * tekshiruvi SAQLANADI: u yagona haqiqat manbai.
 *
 * `canForward: false` ikki sababdan bo'lishi mumkin — oxirgi mavzu (chegara)
 * yoki surish EKRANDA hech narsani o'zgartirmasligi (`forwardMoves: false`,
 * `lib/calendar/position.ts` ga qarang). Ikkinchisida `idleNote` beriladi.
 *
 * `idleNote` KO'RINADIGAN MATN EMAS, `title`: u har kartada takrorlanardi va
 * hafta ro'yxatini o'qib bo'lmas qilardi (bir sahifada 4-5 marta). Matn
 * o'rniga sahifa tepasida BIR MARTA ko'rsatiladi — `app/[locale]/ish/page.tsx`
 * ga qarang.
 */
export function TopicShift({
  teachingClassId,
  canBack,
  canForward,
  backLabel,
  forwardLabel,
  idleNote,
  errors,
  genericError,
}: {
  teachingClassId: string;
  canBack: boolean;
  canForward: boolean;
  backLabel: string;
  forwardLabel: string;
  /** Surish natija bermasa ko'rsatiladigan qisqa izoh. */
  idleNote?: string;
  errors: Record<string, string>;
  genericError: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function shift(direction: "backward" | "forward") {
    setError(null);
    startTransition(async () => {
      const result = await shiftClassPosition({ teachingClassId, direction });
      if (!result.ok) {
        setError(errors[result.error] ?? genericError);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={backLabel}
          disabled={pending || !canBack}
          onClick={() => shift("backward")}
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={forwardLabel}
          title={idleNote}
          disabled={pending || !canForward}
          onClick={() => shift("forward")}
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
