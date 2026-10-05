"use client";

import { AnswerKeyBlock, type QuestionRef } from "@/components/editor/blocks/answer-key-block";
import { HeadingBlock } from "@/components/editor/blocks/heading-block";
import { HomeworkBlock } from "@/components/editor/blocks/homework-block";
import { MaterialsBlock, ObjectivesBlock } from "@/components/editor/blocks/items-block";
import { ListBlock } from "@/components/editor/blocks/list-block";
import { NoteBlock } from "@/components/editor/blocks/note-block";
import { ParagraphBlock } from "@/components/editor/blocks/paragraph-block";
import { QuestionBlock } from "@/components/editor/blocks/question-block";
import { RubricBlock } from "@/components/editor/blocks/rubric-block";
import { StagesBlock } from "@/components/editor/blocks/stages-block";
import { TableBlock } from "@/components/editor/blocks/table-block";
import type { Block } from "@/lib/documents/blocks";

/**
 * Blok turi -> tahrirlagich.
 *
 * `default` TARMOG'I ATAYLAB YO'Q (`components/generation/document-blocks.tsx`
 * bilan bir xil sabab): `Block` union'iga o'n uchinchi tur qo'shilsa
 * TypeScript aynan shu yerda yiqiladi va yangi tur jimgina tahrirsiz
 * qolib ketmaydi.
 */
export function BlockEditor({
  block,
  questions,
  onChange,
}: {
  block: Block;
  /** `answerKey` havolalari uchun hujjatdagi savollar. */
  questions: readonly QuestionRef[];
  onChange: (block: Block) => void;
}) {
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
  }
}
