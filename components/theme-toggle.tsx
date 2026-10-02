"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Tungi/kunduzgi rejim almashtirgichi.
 *
 * NEGA `mounted` HOLATI YO'Q: hidratsiya nomuvofiqligi markup'ni
 * `resolvedTheme` ga qarab SHOXLASHDAN kelib chiqadi (server "Sun" render
 * qiladi, klient "Moon" ni kutadi). Bu yerda shoxlashning o'zi yo'q —
 * ikkala ikonka ham doim DOM'da, qaysi biri ko'rinishini `dark:` varianti
 * hal qiladi. `resolvedTheme` faqat `onClick` ichida, ya'ni mount'dan
 * keyin o'qiladi.
 *
 * Shu sababdan `aria-label` ham holatga bog'liq EMAS ("tungi rejimga o'tish"
 * emas, balki "tungi/kunduzgi rejim"): aks holda label server va klientda
 * farq qilib, aynan o'zimiz qochgan nomuvofiqlik qaytib kelardi.
 *
 * NEGA `useTranslations`: bu komponent `NextIntlClientProvider` ichida
 * (`app/[locale]/layout.tsx`), ya'ni server layout'dan prop uzatish shart
 * emas — funksiya prop uzatish esa taqiqlangan
 * (`tests/client-props-guard.test.ts`).
 */
export function ThemeToggle() {
  const t = useTranslations("Theme");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-touch"
      aria-label={t("toggle")}
      onClick={() => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
    >
      <Sun className="size-5 dark:hidden" strokeWidth={1.5} />
      <Moon className="hidden size-5 dark:block" strokeWidth={1.5} />
    </Button>
  );
}
