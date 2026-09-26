"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { grantCredits } from "@/server/credit-actions";

/**
 * Bitta o'qituvchiga kredit berish tugmasi (admin jadvalining bir yacheykasi).
 *
 * `router.refresh()` — `revalidatePath` ga QO'SHIMCHA: jadval qatorlari server
 * komponentda render bo'ladi, ya'ni yangi balans ko'rinishi uchun RSC
 * daraxti qayta olinishi kerak (`components/admin/topic-node.tsx` naqshi).
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno).
 */

const ERRORS: Record<string, string> = {
  invalid: "Miqdor 1–1000 oralig'ida butun son bo'lishi kerak.",
  topilmadi: "Foydalanuvchi topilmadi (o'chirilgan bo'lishi mumkin).",
  xato: "Saqlanmadi, qaytadan urinib ko'ring.",
};

export function CreditGrant({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        <Input
          type="number"
          min={1}
          max={1000}
          value={amount}
          disabled={pending}
          aria-label="Kredit miqdori"
          className="w-20"
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              // `Number(...)` — Zod butun son kutadi. Bo'sh maydon `NaN`
              // beradi va server "invalid" qaytaradi, ya'ni qorovul bitta
              // joyda (mijozda takrorlanmaydi).
              const result = await grantCredits({ userId, amount: Number(amount) });
              if (result.ok) router.refresh();
              else setError(ERRORS[result.error] ?? ERRORS.xato!);
            });
          }}
        >
          Berish
        </Button>
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
