"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BottomSheet, SheetAction } from "@/components/editor/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { BlockType } from "@/lib/documents/blocks";
import { cn } from "@/lib/utils";

/**
 * Blok qobig'i: fokuslangan karta + v1 ning besh amali.
 *
 * AMALLAR RO'YXATI QAT'IY (sessiya hujjatining 2-bandi): tahrirlash,
 * o'chirish, yuqoriga/pastga, nusxalash, qo'shish. Sudrab tashlash, orqaga
 * qaytarish, birgalikda tahrirlash va versiyalar YO'Q.
 *
 * TELEFON BIRINCHI: `sm:` dan past ekranda amallar pastki varaqda, chunki
 * to'rtta 44 px tugma blok sarlavhasi bilan bitta qatorga sig'maydi.
 * Kattaroq ekranda ular kartaning o'zida turadi.
 *
 * KLAVIATURA OCHILGANDA: `onFocusCapture` kartani ko'rinadigan joyga
 * suradi. `block: "nearest"` ATAYLAB — `"center"` bo'lsa har maydonga
 * o'tishda sahifa sakrab, uzun bloklarda bosh aylanardi.
 */
export function BlockShell({
  type,
  index,
  total,
  invalid,
  onMove,
  onDuplicate,
  onDelete,
  children,
}: {
  type: BlockType;
  index: number;
  total: number;
  invalid: boolean;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const tE = useTranslations("Editor");
  const [focused, setFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const first = index === 0;
  const last = index === total - 1;

  return (
    <div
      ref={card}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface px-3 py-3 transition-colors",
        invalid ? "border-warn" : focused ? "border-ink-2" : "border-line",
      )}
      onFocusCapture={() => {
        if (!focused) card.current?.scrollIntoView({ block: "nearest" });
        setFocused(true);
      }}
      onBlurCapture={() => {
        setFocused(false);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
          {tE(`block.${type}`)}
        </span>

        {/* Telefonda bitta tugma, kattaroq ekranda to'rttasi. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={tE("actions.more")}
          className="sm:hidden"
          onClick={() => {
            setSheetOpen(true);
          }}
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </Button>

        <div className="hidden gap-1 sm:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("actions.moveUp")}
            disabled={first}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ChevronUp className="size-4" strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("actions.moveDown")}
            disabled={last}
            onClick={() => {
              onMove(1);
            }}
          >
            <ChevronDown className="size-4" strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("actions.duplicate")}
            onClick={onDuplicate}
          >
            <Copy className="size-4" strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("actions.delete")}
            onClick={onDelete}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {invalid && (
        <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-xs text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
          {tE("blockInvalid")}
        </p>
      )}

      {children}

      {sheetOpen && (
        <BottomSheet
          title={tE("actions.sheetTitle")}
          closeLabel={tE("actions.close")}
          onClose={() => {
            setSheetOpen(false);
          }}
        >
          <SheetAction
            label={tE("actions.moveUp")}
            disabled={first}
            onClick={() => {
              onMove(-1);
              setSheetOpen(false);
            }}
          >
            <ChevronUp className="size-4" strokeWidth={1.5} />
          </SheetAction>
          <SheetAction
            label={tE("actions.moveDown")}
            disabled={last}
            onClick={() => {
              onMove(1);
              setSheetOpen(false);
            }}
          >
            <ChevronDown className="size-4" strokeWidth={1.5} />
          </SheetAction>
          <SheetAction
            label={tE("actions.duplicate")}
            onClick={() => {
              onDuplicate();
              setSheetOpen(false);
            }}
          >
            <Copy className="size-4" strokeWidth={1.5} />
          </SheetAction>
          <SheetAction
            label={tE("actions.delete")}
            onClick={() => {
              onDelete();
              setSheetOpen(false);
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </SheetAction>
        </BottomSheet>
      )}
    </div>
  );
}
