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
 * IKKI TUR O'CHIRILGAN HOLDA KO'RSATILADI (yashirilmaydi — sababi yonidagi
 * izohda turadi, ya'ni o'qituvchi nima qilish kerakligini biladi). Ikkisi
 * ham `lib/documents/editor-defaults.ts` da `null` qaytaradi:
 *
 *   `answerKey` — savolsiz hujjatda: uning `items[].questionId` mavjud
 *   savolga ishora qilishi kerak, savolsiz esa ishora qiladigan narsa yo'q.
 *
 *   `game` — HAR DOIM: eng kichik o'yin ham 6 ta turli so'z va ta'rifni
 *   talab qiladi (`lib/games/content.ts`), ya'ni bo'sh blok o'ynab
 *   bo'lmaydigan o'yin bo'lardi. O'yin sehrgar orqali mavzudan yaratiladi.
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
            const needsQuestion = type === "answerKey" && !hasQuestion;
            const needsWizard = type === "game";
            const blocked = needsQuestion || needsWizard;
            return (
              <SheetAction
                key={type}
                label={tE(`block.${type}`)}
                hint={
                  needsWizard
                    ? tE("add.needsWizard")
                    : needsQuestion
                      ? tE("add.needsQuestion")
                      : undefined
                }
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
