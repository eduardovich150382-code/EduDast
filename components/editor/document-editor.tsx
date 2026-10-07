"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AddBlockMenu } from "@/components/editor/add-block-menu";
import { BlockEditor } from "@/components/editor/blocks";
import type { QuestionRef } from "@/components/editor/blocks/answer-key-block";
import { BlockShell } from "@/components/editor/block-shell";
import { useAutosave } from "@/components/editor/use-autosave";
import { useDefaultLabels } from "@/components/editor/use-default-labels";
import { EditorHeader } from "@/components/editor/editor-header";
import type { Block, BlockType, DocumentContent } from "@/lib/documents/blocks";
import { newBlock } from "@/lib/documents/editor-defaults";
import { newBlockId, takenIds } from "@/lib/documents/editor-ids";
import {
  appendBlock,
  duplicateBlock,
  moveBlock,
  removeBlock,
  replaceBlock,
} from "@/lib/documents/editor-ops";

/**
 * Muharrirning ildizi — `"use client"` chegarasi aynan shu yerda.
 *
 * Proplar HAMMASI oddiy seriyalanadigan qiymat: funksiya prop server
 * komponentdan uzatilmaydi (`tests/client-props-guard.test.ts`).
 *
 * Tarjima o'zgaruvchisi ATAYLAB `tE`, `t` EMAS: `tests/i18n-usage.test.ts`
 * nomfazani o'zgaruvchi NOMI bo'yicha matn darajasida bog'laydi, shuning
 * uchun muharrirning hamma faylida bitta nom ishlatiladi.
 */
export function DocumentEditor({
  documentId,
  title,
  initialContent,
}: {
  documentId: string;
  title: string;
  initialContent: DocumentContent;
}) {
  const tE = useTranslations("Editor");
  const labels = useDefaultLabels();
  const [content, setContent] = useState(initialContent);
  const { state, issues } = useAutosave({ documentId, content });

  const questions: QuestionRef[] = content.blocks
    .filter((block) => block.type === "question")
    .map((block) => ({ id: block.id, text: block.text }));

  function handleAdd(type: BlockType) {
    const block = newBlock(type, newBlockId(takenIds(content.blocks)), labels, content.blocks);
    // `null` — bu turni hozir qo'shib bo'lmaydi (`answerKey` savolsiz
    // hujjatda). Menyu uni allaqachon o'chirgan, bu ikkinchi qavat.
    if (block === null) return;
    setContent(appendBlock(content, block));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <EditorHeader documentId={documentId} title={title} state={state} />

      {issues?.document === true && (
        <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
          {tE("documentInvalid")}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {content.blocks.map((block, index) => (
          <BlockShell
            key={block.id}
            type={block.type}
            index={index}
            total={content.blocks.length}
            invalid={issues?.blockIds.has(block.id) ?? false}
            onMove={(dir) => {
              setContent(moveBlock(content, index, dir));
            }}
            onDuplicate={() => {
              setContent(duplicateBlock(content, index, newBlockId(takenIds(content.blocks))));
            }}
            onDelete={() => {
              setContent(removeBlock(content, index));
            }}
          >
            <BlockEditor
              block={block}
              questions={questions}
              documentId={documentId}
              onChange={(next: Block) => {
                setContent(replaceBlock(content, index, next));
              }}
            />
          </BlockShell>
        ))}
      </div>

      {content.blocks.length === 0 && (
        <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-ink-2">
          {tE("empty")}
        </p>
      )}

      <AddBlockMenu hasQuestion={questions.length > 0} onAdd={handleAdd} />
    </div>
  );
}
