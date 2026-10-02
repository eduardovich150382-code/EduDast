"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * next-themes provider'ining yupqa o'ramasi.
 *
 * `next-themes` o'zi allaqachon `"use client"`, ya'ni bu fayl chegara uchun
 * emas — uchta sozlamani BITTA joyda saqlash uchun:
 *
 *   attribute="class"  — `app/globals.css` dagi `@custom-variant dark
 *                        (&:is(.dark *))` aynan `.dark` KLASSIGA qaraydi,
 *                        `data-theme` atributiga emas. Shuning uchun bu
 *                        qiymat majburiy va o'zgartirilmaydi.
 *   enableSystem       — birinchi kirishda telefon sozlamasi hurmat qilinadi.
 *   defaultTheme       — "system": o'qituvchi hech narsa tanlamagan bo'lsa.
 *   disableTransitionOnChange
 *                      — almashtirishda butun sahifa rangi bir vaqtda
 *                        "suzib" o'tmasin; aks holda `transition-colors`
 *                        ishlatgan har element ko'zni oladigan to'lqin
 *                        yasaydi.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
