"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps, BlockOf } from "@/components/editor/blocks/props";
import { SelectField } from "@/components/editor/fields/select-field";
import { TextField } from "@/components/editor/fields/text-field";
import { Button } from "@/components/ui/button";
import { omitKey } from "@/lib/documents/editor-ops";

type AnswerKeyItem = BlockOf<"answerKey">["items"][number];

/** Savol havolasi uchun ro'yxat elementi. */
export type QuestionRef = { id: string; text: string };

const MAX_ITEMS = 50;

/**
 * Javoblar kaliti.
 *
 * `questionId` QO'LDA YOZILMAYDI, mavjud savollardan tanlanadi: id lar
 * `s1-question-3` yoki `e1a2b3c0` ko'rinishida va ularni qo'lda yozish
 * ma'nosiz. Hozirgi havola ro'yxatda bo'lmasa (savol o'chirilgan) u
 * ro'yxatning BOSHIGA qo'shiladi — havola ko'rinmay qolib, o'qituvchi uni
 * tuzata olmasligidan ko'ra yaxshi. Sxema osilib qolgan havolani RAD
 * ETMAYDI (`questionId` — oddiy `Id`), ya'ni bu yerda yashirish uni
 * jimgina qoldirardi.
 */
export function AnswerKeyBlock({
  block,
  questions,
  onChange,
}: BlockEditorProps<"answerKey"> & { questions: readonly QuestionRef[] }) {
  const tE = useTranslations("Editor");

  function replaceAt(index: number, item: AnswerKeyItem) {
    onChange({ ...block, items: block.items.map((old, i) => (i === index ? item : old)) });
  }

  return (
    <div className="flex flex-col gap-3">
      {block.items.map((item, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-line px-3 py-3">
          <div className="flex items-end justify-between gap-2">
            <SelectField
              label={tE("field.questionId")}
              value={item.questionId}
              options={questionOptions(questions, item.questionId)}
              onChange={(questionId) => {
                replaceAt(index, { ...item, questionId });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={tE("field.removeItem")}
              disabled={block.items.length <= 1}
              onClick={() => {
                onChange({ ...block, items: block.items.filter((_, i) => i !== index) });
              }}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
            </Button>
          </div>

          <TextField
            label={tE("field.answer")}
            value={item.answer}
            maxLength={500}
            onChange={(answer) => {
              replaceAt(index, { ...item, answer });
            }}
          />
          <ExplanationField
            item={item}
            onChange={(next) => {
              replaceAt(index, next);
            }}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        disabled={block.items.length >= MAX_ITEMS}
        onClick={() => {
          const last = block.items.at(-1);
          if (last === undefined) return;
          onChange({ ...block, items: [...block.items, { ...last }] });
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {tE("field.addItem")}
      </Button>
    </div>
  );
}

/** Savol matni qisqartirilib yorliq bo'ladi; noma'lum havola id bilan turadi. */
function questionOptions(
  questions: readonly QuestionRef[],
  current: string,
): { value: string; label: string }[] {
  const options = questions.map((question) => ({
    value: question.id,
    label: question.text.length > 60 ? `${question.text.slice(0, 60)}...` : question.text,
  }));
  if (options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

/**
 * `explanation` IXTIYORIY: bo'sh qolsa kalit butunlay tashlanadi.
 * `""` yozib qo'yish `txt(1_000).optional()` dan o'tmaydi.
 */
function ExplanationField({
  item,
  onChange,
}: {
  item: AnswerKeyItem;
  onChange: (item: AnswerKeyItem) => void;
}) {
  const tE = useTranslations("Editor");

  return (
    <TextField
      label={tE("field.explanation")}
      value={item.explanation ?? ""}
      maxLength={1_000}
      multiline
      optional
      onChange={(explanation) => {
        if (explanation.trim().length === 0) {
          onChange(omitKey(item, "explanation"));
          return;
        }
        onChange({ ...item, explanation });
      }}
    />
  );
}
