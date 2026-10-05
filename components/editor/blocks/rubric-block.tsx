"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps, BlockOf } from "@/components/editor/blocks/props";
import { NumberField } from "@/components/editor/fields/number-field";
import { StringListField } from "@/components/editor/fields/string-list-field";
import { TextField } from "@/components/editor/fields/text-field";
import { useDefaultLabels } from "@/components/editor/use-default-labels";
import { Button } from "@/components/ui/button";

type Criterion = BlockOf<"rubric">["criteria"][number];

const MAX_CRITERIA = 10;

/** Baholash mezonlari — har mezon nomi, eng ko'p ball va ta'riflar. */
export function RubricBlock({ block, onChange }: BlockEditorProps<"rubric">) {
  const tE = useTranslations("Editor");
  const labels = useDefaultLabels();

  function replaceAt(index: number, criterion: Criterion) {
    onChange({
      ...block,
      criteria: block.criteria.map((item, i) => (i === index ? criterion : item)),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {block.criteria.map((criterion, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-line px-3 py-3">
          <div className="flex items-end justify-between gap-2">
            <TextField
              label={tE("field.name")}
              value={criterion.name}
              maxLength={120}
              onChange={(name) => {
                replaceAt(index, { ...criterion, name });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={tE("field.removeItem")}
              disabled={block.criteria.length <= 1}
              onClick={() => {
                onChange({ ...block, criteria: block.criteria.filter((_, i) => i !== index) });
              }}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
            </Button>
          </div>

          <NumberField
            label={tE("field.maxPoints")}
            value={criterion.maxPoints}
            min={1}
            max={20}
            onChange={(maxPoints) => {
              replaceAt(index, { ...criterion, maxPoints });
            }}
          />
          <StringListField
            label={tE("field.descriptors")}
            items={criterion.descriptors}
            min={1}
            max={5}
            maxLength={300}
            multiline
            addLabel={tE("field.addItem")}
            removeLabel={tE("field.removeItem")}
            onChange={(descriptors) => {
              replaceAt(index, { ...criterion, descriptors });
            }}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        disabled={block.criteria.length >= MAX_CRITERIA}
        onClick={() => {
          onChange({
            ...block,
            criteria: [
              ...block.criteria,
              { name: labels.criterion, maxPoints: 5, descriptors: [labels.item] },
            ],
          });
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {tE("field.addItem")}
      </Button>
    </div>
  );
}
