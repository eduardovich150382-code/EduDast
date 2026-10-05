"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Pastki varaq — blok amallari va blok qo'shish menyusi shuni ishlatadi.
 *
 * `Dialog` PRIMITIVI ISHLATILMADI: `components/ui/dialog.tsx` 11-sessiyada
 * 0 import bilan o'chirilgan va uni qaytarish shu sessiyaning doirasini
 * kengaytirardi. `components/schedule/schedule-grid.tsx:227` da qo'lda
 * yasalgan varaq naqshi allaqachon bor — shu yerda u QATTIQLASHTIRILIB
 * umumiy komponentga chiqarildi: `Escape`, fon bosilganda yopilish,
 * `role="dialog"` va `aria-modal`.
 *
 * FOKUS TUZOG'I YO'Q — ongli chegara (o'sha fayldagi uy qarori). Varaq
 * ichida 2-6 ta tugma turadi va `Escape` har doim chiqish yo'li beradi.
 *
 * Fon `<button>`, `onClick` li `<div>` EMAS: `<div>` klaviaturadan
 * ishlamaydi va `jsx-a11y` uni to'g'ri belgilaydi.
 */
export function BottomSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-ink/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[70vh] w-full flex-col gap-2 overflow-y-auto rounded-t-xl border-t border-line bg-paper px-4 py-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">{title}</p>
          <Button type="button" variant="ghost" size="icon-touch" aria-label={closeLabel} onClick={onClose}>
            <X className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Varaq ichidagi bitta amal qatori — nishon 44 px dan kichik bo'lmasin. */
export function SheetAction({
  label,
  hint,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm text-ink hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
      <span>{label}</span>
      {hint !== undefined && <span className="ml-auto text-xs text-ink-2">{hint}</span>}
    </button>
  );
}
