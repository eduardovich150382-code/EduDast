"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { NumberField } from "@/components/editor/fields/number-field";
import { StringListField } from "@/components/editor/fields/string-list-field";
import { Button } from "@/components/ui/button";
import { omitKey } from "@/lib/documents/editor-ops";

/**
 * Uyga vazifa.
 *
 * `estimatedMinutes` IXTIYORIY, shuning uchun uni butunlay O'CHIRISH yo'li
 * bo'lishi kerak: `0` yozib qo'yish sxemadan o'tmaydi (`min(1)`), `""` esa
 * son maydoniga sig'maydi. Qo'shish/o'chirish tugmasi — kalitni mavjud va
 * mavjud emas holatlar o'rtasida o'tkazadigan yagona ishonchli usul.
 */
export function HomeworkBlock({ block, onChange }: BlockEditorProps<"homework">) {
  const tE = useTranslations("Editor");

  return (
    <div className="flex flex-col gap-3">
      <StringListField
        label={tE("field.items")}
        items={block.items}
        min={1}
        max={10}
        maxLength={600}
        multiline
        addLabel={tE("field.addItem")}
        removeLabel={tE("field.removeItem")}
        onChange={(items) => {
          onChange({ ...block, items });
        }}
      />

      {block.estimatedMinutes === undefined ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="self-start"
          onClick={() => {
            onChange({ ...block, estimatedMinutes: 20 });
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {tE("field.estimatedMinutes")}
        </Button>
      ) : (
        <div className="flex items-end gap-2">
          <NumberField
            label={tE("field.estimatedMinutes")}
            value={block.estimatedMinutes}
            min={1}
            max={240}
            onChange={(estimatedMinutes) => {
              onChange({ ...block, estimatedMinutes });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("field.removeItem")}
            onClick={() => {
              // Kalit TASHLANADI, `undefined` qilib qo'yilmaydi:
              // `strictObject` uchun mavjud kalit `undefined` bilan ham
              // "berilgan" hisoblanadi.
              onChange(omitKey(block, "estimatedMinutes"));
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
