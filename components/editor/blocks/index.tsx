"use client";

import type { ReactElement } from "react";
import { AnswerKeyBlock, type QuestionRef } from "@/components/editor/blocks/answer-key-block";
import { GameBlock } from "@/components/editor/blocks/game-block";
import { HeadingBlock } from "@/components/editor/blocks/heading-block";
import { HomeworkBlock } from "@/components/editor/blocks/homework-block";
import { MaterialsBlock, ObjectivesBlock } from "@/components/editor/blocks/items-block";
import { ListBlock } from "@/components/editor/blocks/list-block";
import { NoteBlock } from "@/components/editor/blocks/note-block";
import { ParagraphBlock } from "@/components/editor/blocks/paragraph-block";
import { QuestionBlock } from "@/components/editor/blocks/question-block";
import { RubricBlock } from "@/components/editor/blocks/rubric-block";
import { SlideBlock } from "@/components/editor/blocks/slide-block";
import { StagesBlock } from "@/components/editor/blocks/stages-block";
import { TableBlock } from "@/components/editor/blocks/table-block";
import type { Block } from "@/lib/documents/blocks";

/**
 * Blok turi -> tahrirlagich.
 *
 * `default` TARMOG'I ATAYLAB YO'Q (`components/generation/document-blocks.tsx`
 * bilan bir xil sabab): `Block` union'iga yangi tur qo'shilsa TypeScript
 * aynan shu yerda yiqiladi va yangi tur jimgina tahrirsiz qolib ketmaydi.
 *
 * QAYTISH TURI (`: ReactElement`) SHU KAFOLATNING O'ZI — izoh emas.
 * Annotatsiyasiz React komponenti `undefined` qaytarishi mumkin, ya'ni
 * `default` yo'qligi HECH NARSANI ushlamaydi: yetishmagan `case` shunchaki
 * `undefined` beradi va blok ekranda jimgina yo'qoladi. 15-sessiyada
 * `game` turi qo'shilganda aynan shu holat yuzaga chiqdi — `tsc` jim
 * o'tib ketdi. Annotatsiya bilan yetishmagan tarmoq "Function lacks ending
 * return statement" xatosiga aylanadi.
 */
export function BlockEditor({
  block,
  questions,
  documentId,
  onChange,
}: {
  block: Block;
  /** `game` kartasidagi doska/varaq havolalari uchun. */
  documentId: string;
  /** `answerKey` havolalari uchun hujjatdagi savollar. */
  questions: readonly QuestionRef[];
  onChange: (block: Block) => void;
}): ReactElement {
  switch (block.type) {
    case "heading":
      return <HeadingBlock block={block} onChange={onChange} />;
    case "paragraph":
      return <ParagraphBlock block={block} onChange={onChange} />;
    case "list":
      return <ListBlock block={block} onChange={onChange} />;
    case "table":
      return <TableBlock block={block} onChange={onChange} />;
    case "objectives":
      return <ObjectivesBlock block={block} onChange={onChange} />;
    case "materials":
      return <MaterialsBlock block={block} onChange={onChange} />;
    case "stages":
      return <StagesBlock block={block} onChange={onChange} />;
    case "question":
      return <QuestionBlock block={block} onChange={onChange} />;
    case "answerKey":
      return <AnswerKeyBlock block={block} questions={questions} onChange={onChange} />;
    case "rubric":
      return <RubricBlock block={block} onChange={onChange} />;
    case "homework":
      return <HomeworkBlock block={block} onChange={onChange} />;
    case "note":
      return <NoteBlock block={block} onChange={onChange} />;
    case "slide":
      return <SlideBlock block={block} onChange={onChange} />;
    // `onChange` uzatiladi, lekin `GameBlock` uni ISHLATMAYDI: karta faqat
    // o'qish uchun (sabab o'z faylida). Shartnomadan chiqmaslik uchun prop
    // saqlanadi — kelajakda tahrirlash qo'shilsa imzo o'zgarmaydi.
    case "game":
      return <GameBlock block={block} documentId={documentId} onChange={onChange} />;
  }
}
