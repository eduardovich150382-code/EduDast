"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Ko'p tanlovli fan/sinf yorlig'i. `shadcn add checkbox` ATAYLAB
 * ishlatilmadi — bu ~20 qatorlik komponent tayyor paketni yuklashga
 * arzimaydi (CLAUDE.md: sababsiz yangi npm paket qo'shilmaydi).
 */
export function SelectableChip({
  selected,
  onClick,
  children,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-transparent bg-accent text-on-accent"
          : "border-line bg-surface text-ink hover:bg-muted",
      )}
    >
      {children}
      {badge && (
        <span className={cn("ml-1.5 text-xs", selected ? "opacity-80" : "text-ink-2")}>
          {badge}
        </span>
      )}
    </button>
  );
}
