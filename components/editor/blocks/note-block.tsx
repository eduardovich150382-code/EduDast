"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { SelectField } from "@/components/editor/fields/select-field";
import { TextField } from "@/components/editor/fields/text-field";

/** Izoh — ohangi ko'ruvchida fon rangini belgilaydi. */
const TONES = ["info", "warning", "tip"] as const;

export function NoteBlock({ block, onChange }: BlockEditorProps<"note">) {
  const tE = useTranslations("Editor");

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={tE("field.tone")}
        value={block.tone}
        options={TONES.map((tone) => ({ value: tone, label: tE(`enum.tone.${tone}`) }))}
        onChange={(tone) => {
          onChange({ ...block, tone });
        }}
      />
      <TextField
        label={tE("field.text")}
        value={block.text}
        maxLength={1_000}
        multiline
        onChange={(text) => {
          onChange({ ...block, text });
        }}
      />
    </div>
  );
}
