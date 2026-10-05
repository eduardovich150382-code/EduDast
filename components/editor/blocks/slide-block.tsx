"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { SelectField } from "@/components/editor/fields/select-field";
import { StringListField } from "@/components/editor/fields/string-list-field";
import { TextField } from "@/components/editor/fields/text-field";
import { Button } from "@/components/ui/button";
import { SLIDE_LAYOUTS } from "@/lib/documents/blocks";
import { omitKey } from "@/lib/documents/editor-ops";

/**
 * Slayd.
 *
 * `bullets` MINIMUMI NOL (`min={0}`): `title` va `section` ko'rinishida punkt
 * bo'lmasligi normal hol, shuning uchun oxirgi punktni o'chirish taqiqlanmaydi.
 * Yuqori chegara esa 8 — sxemadagi `max(8)` bilan bir xil. 6 dan oshgani
 * taqiqlanmaydi, lekin sifat bahosida ball yo'qotadi (`quality.ts`).
 *
 * `notes` IXTIYORIY, shuning uchun uni butunlay O'CHIRISH yo'li bor —
 * `homework.estimatedMinutes` bilan ayni sabab: `""` sxemadan o'tmaydi
 * (`txt` `min(1)`), ya'ni bo'shatilgan izoh BUTUN hujjatning saqlanishini
 * to'xtatardi. Tugma kalitni mavjud va mavjud emas holatlar orasida
 * o'tkazadigan yagona ishonchli usul.
 */
export function SlideBlock({ block, onChange }: BlockEditorProps<"slide">) {
  const tE = useTranslations("Editor");

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={tE("field.layout")}
        value={block.layout}
        options={SLIDE_LAYOUTS.map((layout) => ({
          value: layout,
          label: tE(`enum.layout.${layout}`),
        }))}
        onChange={(layout) => {
          onChange({ ...block, layout });
        }}
      />

      <TextField
        label={tE("field.title")}
        value={block.title}
        maxLength={120}
        onChange={(title) => {
          onChange({ ...block, title });
        }}
      />

      <StringListField
        label={tE("field.bullets")}
        items={block.bullets}
        min={0}
        max={8}
        maxLength={200}
        addLabel={tE("field.addItem")}
        removeLabel={tE("field.removeItem")}
        onChange={(bullets) => {
          onChange({ ...block, bullets });
        }}
      />

      {block.notes === undefined ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="self-start"
          onClick={() => {
            onChange({ ...block, notes: tE("defaults.text") });
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {tE("field.notes")}
        </Button>
      ) : (
        <div className="flex items-end gap-2">
          <div className="grow">
            <TextField
              label={tE("field.notes")}
              value={block.notes}
              maxLength={1_000}
              multiline
              onChange={(notes) => {
                onChange({ ...block, notes });
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={tE("field.removeItem")}
            onClick={() => {
              // Kalit TASHLANADI, `undefined` qilib qo'yilmaydi: `strictObject`
              // uchun mavjud kalit `undefined` bilan ham "berilgan" hisoblanadi.
              onChange(omitKey(block, "notes"));
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
