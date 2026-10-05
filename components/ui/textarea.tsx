import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Ko'p qatorli matn maydoni.
 *
 * `@base-ui/react` da `Textarea` primitivi YO'Q, shuning uchun oddiy
 * `<textarea>` — uslublar `components/ui/input.tsx` dan ko'chirilgan, lekin
 * `h-8` o'rniga `min-h-11`: muharrir telefonda ishlatiladi va 44 px eng
 * kichik xavfsiz teginish nishoni (`button.tsx` dagi `touch` o'lchami
 * bilan bir xil sabab).
 *
 * `field-sizing-content` — matn o'sganda maydon O'ZI uzayadi, JS'siz.
 * Qo'llab-quvvatlamagan brauzerda `min-h-11` + `rows` qoladi, ya'ni maydon
 * oddiy textarea bo'lib ishlaydi — buzilmaydi.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
