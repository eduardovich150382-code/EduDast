"use client";

import { useTranslations } from "next-intl";
import type { DefaultLabels } from "@/lib/documents/editor-labels";

/**
 * `Editor.defaults.*` dan `DefaultLabels` yig'adi.
 *
 * `lib/documents/editor-defaults.ts` va `editor-question.ts` yangi blok
 * yasaganda shu matnlarni oladi. Tarjima FUNKSIYASI `lib` ga uzatilmaydi —
 * sof modul `next-intl` ga bog'lanib qolmasligi kerak, shuning uchun
 * chegara aynan shu yerda: hook tayyor satrlarni qaytaradi.
 */
export function useDefaultLabels(): DefaultLabels {
  const tE = useTranslations("Editor");

  return {
    heading: tE("defaults.heading"),
    text: tE("defaults.text"),
    item: tE("defaults.item"),
    question: tE("defaults.question"),
    answer: tE("defaults.answer"),
    option: tE("defaults.option"),
    column: tE("defaults.column"),
    stage: tE("defaults.stage"),
    criterion: tE("defaults.criterion"),
    pairLeft: tE("defaults.pairLeft"),
    pairRight: tE("defaults.pairRight"),
  };
}
