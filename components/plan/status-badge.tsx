import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mavzu holati yorlig'i: o'tilgan / hozirgi / oldinda.
 *
 * Server komponent (`"use client"` YO'Q) — bosilmaydi, faqat ko'rsatadi.
 *
 * Matn PROP orqali keladi, `useTranslations` ichda chaqirilmaydi: chaqiruvchi
 * server sahifa allaqachon `getTranslations` ishlatadi va shu yerda
 * takrorlash ikkinchi tarjima nuqtasini yaratardi.
 *
 * Ranglar `styles/tokens.css` semantikasi bo'yicha: `accent-2` — muvaffaqiyat
 * va progress, `accent` — asosiy diqqat, `ink-2` — ikkilamchi matn.
 */

export type TopicStatus = "done" | "current" | "ahead";

const ICONS = {
  done: CheckCircle2,
  current: PlayCircle,
  ahead: Circle,
} as const;

const STYLES: Record<TopicStatus, string> = {
  done: "border-accent-2/40 text-accent-2",
  current: "border-accent bg-accent text-on-accent",
  ahead: "border-line text-ink-2",
};

export function StatusBadge({ status, label }: { status: TopicStatus; label: string }) {
  const Icon = ICONS[status];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        STYLES[status],
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.5} />
      {label}
    </span>
  );
}
