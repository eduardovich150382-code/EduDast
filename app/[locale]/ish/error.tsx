"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * `/ish` bo'limining xato chegarasi.
 *
 * Repodagi BIRINCHI `error.tsx`. Sabab shu sessiyada paydo bo'ldi:
 * generatsiya yo'lida bazaga va LLM'ga boradigan kod ko'p, va ular
 * yiqilganda o'qituvchi oq ekran o'rniga tushunarli xabar ko'rishi kerak.
 *
 * `error.tsx` HAR DOIM client komponent bo'lishi shart (Next.js talabi).
 * `useTranslations` ishlaydi, chunki `NextIntlClientProvider`
 * `app/[locale]/layout.tsx` da, ya'ni bu chegaradan YUQORIDA.
 */
export default function IshError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Ish.error");

  useEffect(() => {
    // Sentry `instrumentation` orqali o'zi ushlaydi; bu yerda faqat
    // lokal ishlash uchun iz. `digest` — prodda logni topish kaliti.
    console.error("[ish] xato chegarasi", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
      <AlertTriangle className="size-8 text-warn" strokeWidth={1.5} />
      <h1 className="font-heading text-xl font-semibold text-ink">{t("title")}</h1>
      <p className="text-sm text-ink-2">{t("description")}</p>
      <Button type="button" variant="outline" size="touch" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
