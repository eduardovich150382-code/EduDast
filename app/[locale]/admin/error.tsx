"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Admin panelining xato chegarasi.
 *
 * MATN HARDCODE — CLAUDE.md 1-qoidasining istisnosi: `app/[locale]/admin/**`
 * faqat o'zbek tilida (lotin), i18n'dan ozod. Dizayn tokenlari qoidasi (2-
 * qoida) esa bu yerga ham to'liq amal qiladi, shuning uchun ranglar faqat
 * token utilitalaridan.
 *
 * `error.tsx` har doim client komponent bo'lishi shart (Next.js talabi).
 *
 * NEGA KERAK: admin sahifalari kalendar, kurikulum va sifat jadvallarini
 * o'qiydi; ulardan birortasi yiqilsa Next'ning standart ekrani chiqib,
 * `digest` ni topish uchun log kovlash kerak bo'lardi.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry `instrumentation` orqali o'zi ushlaydi; bu yerda faqat lokal
    // ishlash uchun iz. `digest` — prodda logni topish kaliti.
    console.error("[admin] xato chegarasi", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
      <AlertTriangle className="size-8 text-warn" strokeWidth={1.5} />
      <h1 className="font-heading text-xl font-semibold text-ink">
        Nimadir xato ketdi
      </h1>
      <p className="text-sm text-ink-2">
        Sahifani qayta yuklang. Muammo takrorlansa, server loglarini
        tekshiring — xato kodi: {error.digest ?? "yo'q"}
      </p>
      <Button type="button" variant="outline" onClick={reset}>
        Qaytadan urinish
      </Button>
    </div>
  );
}
