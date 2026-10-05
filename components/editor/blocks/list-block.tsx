"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { SelectField } from "@/components/editor/fields/select-field";
import { StringListField } from "@/components/editor/fields/string-list-field";

/** Ro'yxat — raqamli yoki belgili. */
const STYLES = ["bullet", "ordered"] as const;

export function ListBlock({ block, onChange }: BlockEditorProps<"list">) {
  const tE = useTranslations("Editor");

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={tE("field.style")}
        value={block.style}
        options={STYLES.map((style) => ({ value: style, label: tE(`enum.style.${style}`) }))}
        onChange={(style) => {
          onChange({ ...block, style });
        }}
      />
      <StringListField
        label={tE("field.items")}
        items={block.items}
        min={1}
        max={30}
        maxLength={500}
        addLabel={tE("field.addItem")}
        removeLabel={tE("field.removeItem")}
        onChange={(items) => {
          onChange({ ...block, items });
        }}
      />
    </div>
  );
}
