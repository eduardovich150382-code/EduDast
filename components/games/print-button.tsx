"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * `window.print()` tugmasi.
 *
 * ALOHIDA KLIENT KOMPONENT, sahifa esa server bo'lib qoladi: `onClick`
 * server komponentdan uzatilmaydi (`tests/client-props-guard.test.ts`
 * server -> klient funksiya prop'ini bloklaydi), shuning uchun chaqiruv
 * shu faylning ichida yashaydi va tashqariga faqat SATR props chiqadi.
 *
 * `components/slides/player-controls.tsx` dagi ayni naqsh. Qog'ozda
 * ko'rinmasligi uchun `game-chrome` klassi.
 */
export function PrintButton({ label, hint }: { label: string; hint: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="touch"
      className="game-chrome"
      title={hint}
      onClick={() => {
        window.print();
      }}
    >
      <Printer className="size-4" strokeWidth={1.5} />
      {label}
    </Button>
  );
}
