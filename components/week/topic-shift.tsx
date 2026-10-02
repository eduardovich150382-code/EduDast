"use client";

import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
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
 * `canBack`/`canForward` — HAQIQIY chegara: mavzular ro'yxatining boshi va
 * oxiri. Ular `positionForClass` ning `previousTopicId`/`nextTopicId` idan
 * keladi, `shiftClassPosition` esa aynan shu ikki maydonni o'qiydi — ya'ni
 * tugma holati va server qarori BIR XIL manbadan.
 */
export function TopicShift({
  teachingClassId,
  canBack,
  canForward,
  backLabel,
  forwardLabel,
  errors,
  genericError,
}: {
  teachingClassId: string;
  canBack: boolean;
  canForward: boolean;
  backLabel: string;
  forwardLabel: string;
  errors: Record<string, string>;
  genericError: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function shift(direction: "backward" | "forward") {
    startTransition(async () => {
      const result = await shiftClassPosition({ teachingClassId, direction });
      if (!result.ok) {
        // Toast, inline `<p>` emas: bu tugmalar har bir sinf kartasining
        // o'ng burchagida turadi, ya'ni inline xato kartani sakrab
        // ko'tarib, o'qituvchi bosmoqchi bo'lgan narsani siljitardi.
        toast.error(errors[result.error] ?? genericError);
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
          disabled={pending || !canForward}
          onClick={() => shift("forward")}
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
