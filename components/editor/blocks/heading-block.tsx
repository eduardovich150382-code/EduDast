"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { SelectField } from "@/components/editor/fields/select-field";
import { TextField } from "@/components/editor/fields/text-field";

/**
 * Sarlavha.
 *
 * `level` — 1 | 2 | 3 SON, satr emas (`blocks.ts:53`), shuning uchun
 * tanlagich qiymati satrdan songa qaytariladi. Yorliqlar "Katta / O'rta /
 * Kichik": o'qituvchiga `h1`/`h2` dan ko'ra tushunarli.
 */
const LEVELS = ["1", "2", "3"] as const;

export function HeadingBlock({ block, onChange }: BlockEditorProps<"heading">) {
  const tE = useTranslations("Editor");

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={tE("field.level")}
        value={String(block.level) as (typeof LEVELS)[number]}
        options={LEVELS.map((level) => ({ value: level, label: tE(`enum.level.${level}`) }))}
        onChange={(level) => {
          onChange({ ...block, level: Number.parseInt(level, 10) as 1 | 2 | 3 });
        }}
      />
      <TextField
        label={tE("field.text")}
        value={block.text}
        maxLength={200}
        onChange={(text) => {
          onChange({ ...block, text });
        }}
      />
    </div>
  );
}
