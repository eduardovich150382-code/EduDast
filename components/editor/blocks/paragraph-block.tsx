"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { TextField } from "@/components/editor/fields/text-field";

/** Oddiy matn. Formatlash blok TURI orqali, matn ichida emas (markdown yo'q). */
export function ParagraphBlock({ block, onChange }: BlockEditorProps<"paragraph">) {
  const tE = useTranslations("Editor");

  return (
    <TextField
      label={tE("field.text")}
      value={block.text}
      maxLength={4_000}
      multiline
      onChange={(text) => {
        onChange({ ...block, text });
      }}
    />
  );
}
