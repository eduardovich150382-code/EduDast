"use client";

import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { NumberField } from "@/components/editor/fields/number-field";
import { SelectField } from "@/components/editor/fields/select-field";
import { StringListField } from "@/components/editor/fields/string-list-field";
import { TextField } from "@/components/editor/fields/text-field";
import { useDefaultLabels } from "@/components/editor/use-default-labels";
import { BLOOM, type BloomLevel } from "@/lib/documents/blocks";
import { withQuestionKind, type QuestionKind } from "@/lib/documents/editor-question";
import { PairsField } from "@/components/editor/blocks/pairs-field";

/**
 * Bitta savol.
 *
 * TURNI ALMASHTIRISH `withQuestionKind` ORQALI: `blocks.ts` dagi
 * `superRefine` kesishma qoidalar qo'yadi (mcq -> 3 ta turli variant,
 * truefalse/match -> variantsiz, `pairs` faqat match'da). Faqat `kind` ni
 * o'zgartirish blokni DARHOL nosog'lom qilardi va o'qituvchi sababini
 * ko'rmasdi — u shunchaki ro'yxatdan boshqa turni tanlagan edi.
 *
 * MCQ DA JAVOB TANLANADI, YOZILMAYDI: `options.includes(answer)` qoidasi
 * shu bilan o'z-o'zidan bajariladi. Javob MATN sifatida saqlanadi, indeks
 * sifatida emas (`blocks.ts:129`) — variantlar tartibi o'zgarganda indeks
 * jimgina noto'g'ri javobga aylanardi.
 */
const KINDS: readonly QuestionKind[] = ["mcq", "short", "truefalse", "match"];

export function QuestionBlock({ block, onChange }: BlockEditorProps<"question">) {
  const tE = useTranslations("Editor");
  const labels = useDefaultLabels();

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={tE("field.kind")}
        value={block.kind}
        options={KINDS.map((kind) => ({ value: kind, label: tE(`enum.kind.${kind}`) }))}
        onChange={(kind) => {
          onChange(withQuestionKind(block, kind, labels));
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

      {block.kind === "mcq" && (
        <StringListField
          label={tE("field.options")}
          items={block.options}
          min={3}
          max={8}
          maxLength={300}
          addLabel={tE("field.addItem")}
          removeLabel={tE("field.removeItem")}
          onChange={(options) => {
            onChange({ ...block, options });
          }}
        />
      )}

      {block.kind === "match" && block.pairs !== undefined && (
        <PairsField
          pairs={block.pairs}
          onChange={(pairs) => {
            onChange({ ...block, pairs });
          }}
        />
      )}

      <AnswerField block={block} onChange={onChange} />

      {block.kind === "mcq" && <p className="text-xs text-ink-2">{tE("errors.mcqRules")}</p>}

      <div className="flex flex-wrap gap-3">
        <NumberField
          label={tE("field.points")}
          value={block.points}
          min={1}
          max={20}
          onChange={(points) => {
            onChange({ ...block, points });
          }}
        />
        <SelectField
          label={tE("field.bloom")}
          value={block.bloom}
          options={BLOOM.map((level: BloomLevel) => ({
            value: level,
            label: tE(`enum.bloom.${level}`),
          }))}
          onChange={(bloom) => {
            onChange({ ...block, bloom });
          }}
        />
      </div>
    </div>
  );
}

/**
 * To'g'ri javob.
 *
 * `mcq` da — variantlar ichidan tanlov. Agar hozirgi javob ro'yxatda
 * bo'lmasa (o'qituvchi variantni tahrirlagan), u ro'yxatning BOSHIGA
 * qo'shiladi: aks holda tanlagich bo'sh ko'rinib, o'qituvchi javobini
 * butunlay yo'qotgan deb o'ylardi. Bo'sh variantlar tanlovga chiqmaydi.
 *
 * Bo'sh bo'lmagan variant qolmasa oddiy matn maydoniga tushadi — tanlov
 * ro'yxati bo'sh `Select` foydalanuvchini qamab qo'yardi.
 */
function AnswerField({ block, onChange }: BlockEditorProps<"question">) {
  const tE = useTranslations("Editor");

  if (block.kind === "mcq") {
    const filled = block.options.filter((option) => option.trim().length > 0);
    const options = filled.includes(block.answer) ? filled : [block.answer, ...filled];
    const usable = options.filter((option) => option.trim().length > 0);

    if (usable.length > 0) {
      return (
        <SelectField
          label={tE("field.answer")}
          value={block.answer}
          options={usable.map((option) => ({ value: option, label: option }))}
          onChange={(answer) => {
            onChange({ ...block, answer });
          }}
        />
      );
    }
  }

  return (
    <TextField
      label={tE("field.answer")}
      value={block.answer}
      maxLength={500}
      onChange={(answer) => {
        onChange({ ...block, answer });
      }}
    />
  );
}
