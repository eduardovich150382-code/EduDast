"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BottomSheet, SheetAction } from "@/components/editor/bottom-sheet";
import { Button } from "@/components/ui/button";
import { BLOCK_TYPES, type BlockType } from "@/lib/documents/blocks";

/**
 * Yangi blok qo'shish menyusi.
 *
 * Turlar `BLOCK_TYPES` TARTIBIDA — u `blocks.ts` dagi union tartibini
 * takrorlaydi va dars ishlanmaning tabiiy ketma-ketligiga mos (sarlavha,
 * matn, ro'yxat, ..., izoh). Alohida tartib yasash ikkinchi haqiqat
 * manbai bo'lardi.
 *
 * `answerKey` savolsiz hujjatda O'CHIRILGAN: uning `items[].questionId`
 * mavjud savolga ishora qilishi kerak, savolsiz esa ishora qiladigan
 * narsa yo'q (`lib/documents/editor-defaults.ts` shu holda `null`
 * qaytaradi). Tugmani yashirish o'rniga o'chirilgan holda ko'rsatiladi —
 * sababi yonidagi izohda turadi, ya'ni o'qituvchi nima qilish kerakligini
 * biladi.
 *
 * Blok OXIRIGA qo'shiladi; joyini qobiqdagi yuqoriga/pastga tugmalari hal
 * qiladi. Oraga qo'shish v1 ga kirmaydi.
 */
export function AddBlockMenu({
  hasQuestion,
  onAdd,
}: {
  hasQuestion: boolean;
  onAdd: (type: BlockType) => void;
}) {
  const tE = useTranslations("Editor");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {tE("add.action")}
      </Button>

      {open && (
        <BottomSheet
          title={tE("add.sheetTitle")}
          closeLabel={tE("actions.close")}
          onClose={() => {
            setOpen(false);
          }}
        >
          {BLOCK_TYPES.map((type) => {
            const blocked = type === "answerKey" && !hasQuestion;
            return (
              <SheetAction
                key={type}
                label={tE(`block.${type}`)}
                hint={blocked ? tE("add.needsQuestion") : undefined}
                disabled={blocked}
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
              />
            );
          })}
        </BottomSheet>
      )}
    </>
  );
}
