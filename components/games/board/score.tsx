"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * O'yin doskasining yuqori paneli: BALL, holat va qayta boshlash.
 *
 * `useTranslations` SHU YERDA chaqiriladi, matn prop sifatida UZATILMAYDI.
 * Sabab: ball o'yin paytida o'zgaradi, ya'ni `Ball: {score}` ni serverda
 * formatlab bo'lmaydi — statik satr qotib qolardi. ICM interpolatsiyasini
 * qo'lda qilish (`${label}: ${score}`) esa uchala tilda tartibni
 * buzardi (rus tilida yorliq boshqa joyda turishi mumkin).
 *
 * `"use client"` — tugma va tarjima hook'i bor. Daraxtdagi HAR `.tsx` ga
 * direktiva qo'yiladi: `tests/client-props-guard.test.ts` direktivasiz
 * faylni server komponent deb biladi.
 */
export function ScoreBar({
  score,
  progress,
  onRestart,
}: {
  score: number;
  /** "3/10" yoki "4/8" — tayyor satr, formatlash chaqiruvchida. */
  progress: string;
  onRestart: () => void;
}) {
  const tG = useTranslations("Games");

  return (
    <div className="game-chrome flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-4">
        <span className="text-2xl font-semibold tabular-nums">{tG("score", { score })}</span>
        <span className="text-lg opacity-80 tabular-nums">{progress}</span>
      </div>

      <Button type="button" variant="outline" size="touch" onClick={onRestart}>
        <RotateCcw className="size-4" strokeWidth={1.5} />
        {tG("restart")}
      </Button>
    </div>
  );
}
