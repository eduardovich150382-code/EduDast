"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { NumberField } from "@/components/editor/fields/number-field";
import { StringListField } from "@/components/editor/fields/string-list-field";
import { TextField } from "@/components/editor/fields/text-field";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { Button } from "@/components/ui/button";
import type { StageItem } from "@/lib/documents/blocks";

/**
 * Dars bosqichlari.
 *
 * TIPLI MAYDONLAR — sessiya hujjatining 1-bandi: sarlavha, daqiqa,
 * o'qituvchi harakatlari va o'quvchi harakatlari ALOHIDA maydonlarda,
 * bitta katta matn sifatida EMAS. Bitta matn bo'lsa `stages` blokining
 * butun qiymati yo'qolardi: `lib/generation/quality.ts` daqiqalar
 * yig'indisini tekshiradi, eksport esa harakatlarni alohida chiqaradi.
 *
 * Bosqichlar INDEKS bo'yicha kalitlanadi — `StageItem` da id yo'q va uni
 * qo'shib bo'lmaydi (`blocks.ts` saqlash shartnomasi). Shuning uchun
 * `NumberField` tashqi qiymat o'zgarganda mahalliy matnini qayta tiklaydi.
 */
const MIN_STAGES = 2;
const MAX_STAGES = 10;

export function StagesBlock({ block, onChange }: BlockEditorProps<"stages">) {
  const tE = useTranslations("Editor");

  function replaceStage(index: number, stage: StageItem) {
    onChange({ ...block, items: block.items.map((item, i) => (i === index ? stage : item)) });
  }

  return (
    <div className="flex flex-col gap-3">
      {block.items.map((stage, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-line px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-ink-2">
              {`${tE("field.title")} ${String(index + 1)}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={tE("field.removeStage")}
              disabled={block.items.length <= MIN_STAGES}
              onClick={() => {
                onChange({ ...block, items: block.items.filter((_, i) => i !== index) });
              }}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
            </Button>
          </div>

          <StageFields
            stage={stage}
            onChange={(next) => {
              replaceStage(index, next);
            }}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        disabled={block.items.length >= MAX_STAGES}
        onClick={() => {
          const last = block.items.at(-1);
          if (last === undefined) return;
          // Oxirgi bosqichning NUSXASI: bo'sh bosqich qo'shish blokni
          // darhol nosog'lom qilardi (`txt` har matndan bo'sh bo'lmaslikni
          // talab qiladi), nusxa esa tayyor shaklni beradi.
          onChange({ ...block, items: [...block.items, structuredClone(last)] });
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {tE("field.addStage")}
      </Button>
    </div>
  );
}

/** Bitta bosqichning maydonlari — asosiy komponent 40 qatordan oshmasin. */
function StageFields({
  stage,
  onChange,
}: {
  stage: StageItem;
  onChange: (stage: StageItem) => void;
}) {
  const tE = useTranslations("Editor");

  return (
    <>
      <TextField
        label={tE("field.title")}
        value={stage.title}
        maxLength={120}
        onChange={(title) => {
          onChange({ ...stage, title });
        }}
      />
      <NumberField
        label={tE("field.minutes")}
        value={stage.minutes}
        min={1}
        max={120}
        onChange={(minutes) => {
          onChange({ ...stage, minutes });
        }}
      />
      <StringListField
        label={tE("field.teacherActions")}
        items={stage.teacherActions}
        min={1}
        max={10}
        maxLength={500}
        multiline
        addLabel={tE("field.addItem")}
        removeLabel={tE("field.removeItem")}
        onChange={(teacherActions) => {
          onChange({ ...stage, teacherActions });
        }}
      />
      <StringListField
        label={tE("field.studentActions")}
        items={stage.studentActions}
        min={1}
        max={10}
        maxLength={500}
        multiline
        addLabel={tE("field.addItem")}
        removeLabel={tE("field.removeItem")}
        onChange={(studentActions) => {
          onChange({ ...stage, studentActions });
        }}
      />
    </>
  );
}
