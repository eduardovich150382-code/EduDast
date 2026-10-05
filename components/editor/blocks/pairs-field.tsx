"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { TextField } from "@/components/editor/fields/text-field";
import { useDefaultLabels } from "@/components/editor/use-default-labels";
import { Button } from "@/components/ui/button";
import { numbered } from "@/lib/documents/editor-labels";

type Pair = { left: string; right: string };

/**
 * `question.pairs` — moslashtirish savolining juftliklari.
 *
 * ALOHIDA KOMPONENT, chunki `StringListField` bu yerda yaramaydi: juftlik
 * ikki maydondan iborat va ular `blocks.ts:124` da ATAYLAB alohida —
 * atamaning o'zida tire uchraydi ("Nyuton-metr — ish birligi"), ya'ni
 * bitta satrni ajratgich bo'yicha bo'lish ertami-kechmi noto'g'ri joyda
 * kesardi.
 *
 * Yangi juftlik BO'SH emas, standart yorliq bilan tug'iladi: bo'sh matn
 * `txt(200)` dan o'tmaydi va butun hujjatning saqlanishini to'xtatardi.
 */
const MIN_PAIRS = 2;
const MAX_PAIRS = 10;

export function PairsField({
  pairs,
  onChange,
}: {
  pairs: readonly Pair[];
  onChange: (pairs: Pair[]) => void;
}) {
  const tE = useTranslations("Editor");
  const labels = useDefaultLabels();

  function replaceAt(index: number, pair: Pair) {
    onChange(pairs.map((item, i) => (i === index ? pair : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-2">{tE("field.pairs")}</span>

      {pairs.map((pair, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            label={tE("field.pairLeft")}
            value={pair.left}
            maxLength={200}
            onChange={(left) => {
              replaceAt(index, { ...pair, left });
            }}
          />
          <TextField
            label={tE("field.pairRight")}
            value={pair.right}
            maxLength={200}
            onChange={(right) => {
              replaceAt(index, { ...pair, right });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("field.removeItem")}
            disabled={pairs.length <= MIN_PAIRS}
            onClick={() => {
              onChange(pairs.filter((_, i) => i !== index));
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        disabled={pairs.length >= MAX_PAIRS}
        onClick={() => {
          const index = pairs.length + 1;
          onChange([
            ...pairs,
            {
              left: numbered(labels.pairLeft, index),
              right: numbered(labels.pairRight, index),
            },
          ]);
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {tE("field.addItem")}
      </Button>
    </div>
  );
}
