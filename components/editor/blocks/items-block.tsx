"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { StringListField } from "@/components/editor/fields/string-list-field";

/**
 * `objectives` va `materials` — shakli bir xil (`items: string[]`), faqat
 * chegaralari farq qiladi.
 *
 * NEGA `homework` BU YERDA EMAS: unda qo'shimcha `estimatedMinutes`
 * maydoni bor, ya'ni uni shu yerga tiqish shartli maydon qo'shishni talab
 * qilardi. Ikki yaqin blok uchun bitta umumlashtirish — ha; uchinchisini
 * majburan sig'dirish — yo'q.
 */
export function ObjectivesBlock({ block, onChange }: BlockEditorProps<"objectives">) {
  const tE = useTranslations("Editor");

  return (
    <StringListField
      label={tE("field.items")}
      items={block.items}
      min={1}
      max={10}
      maxLength={300}
      multiline
      addLabel={tE("field.addItem")}
      removeLabel={tE("field.removeItem")}
      onChange={(items) => {
        onChange({ ...block, items });
      }}
    />
  );
}

export function MaterialsBlock({ block, onChange }: BlockEditorProps<"materials">) {
  const tE = useTranslations("Editor");

  return (
    <StringListField
      label={tE("field.items")}
      items={block.items}
      min={1}
      max={20}
      maxLength={200}
      addLabel={tE("field.addItem")}
      removeLabel={tE("field.removeItem")}
      onChange={(items) => {
        onChange({ ...block, items });
      }}
    />
  );
}
