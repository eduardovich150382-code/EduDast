"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps, BlockOf } from "@/components/editor/blocks/props";
import { TextField } from "@/components/editor/fields/text-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { omitKey } from "@/lib/documents/editor-ops";

/**
 * Jadval.
 *
 * ENG MUHIM QOIDA: `blocks.ts:80` dagi refine har satrdagi katak sonini
 * sarlavhalar soniga TENG bo'lishini talab qiladi. Shuning uchun ustun
 * qo'shish/o'chirish HAR SATRNI birga o'zgartiradi — ikkisini alohida amal
 * qilib qo'yish jadvalni jimgina nosog'lom holatda qoldirardi.
 *
 * KATAK BO'SH BO'LISHI MUMKIN (`txt` emas, `.max(500)`), sarlavha esa
 * yo'q — jadvalda bo'sh katak normal hol.
 *
 * `caption` IXTIYORIY: bo'sh qolsa kalit butunlay tashlanadi, `""` yozilmaydi
 * (`txt(200).optional()` bo'sh satrni rad etardi).
 */
const MAX_COLUMNS = 8;
const MAX_ROWS = 40;

type TableBlockValue = BlockOf<"table">;

export function TableBlock({ block, onChange }: BlockEditorProps<"table">) {
  const tE = useTranslations("Editor");

  function setCaption(caption: string) {
    const trimmed = caption.trim();
    if (trimmed.length === 0) {
      onChange(omitKey(block, "caption"));
      return;
    }
    onChange({ ...block, caption });
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={tE("field.caption")}
        value={block.caption ?? ""}
        maxLength={200}
        optional
        onChange={setCaption}
      />

      <TableGrid block={block} onChange={onChange} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={block.headers.length >= MAX_COLUMNS}
          onClick={() => {
            onChange(addColumn(block, `${tE("field.headers")} ${String(block.headers.length + 1)}`));
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {tE("field.addColumn")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={block.rows.length >= MAX_ROWS}
          onClick={() => {
            onChange({ ...block, rows: [...block.rows, block.headers.map(() => "")] });
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {tE("field.addRow")}
        </Button>
      </div>
    </div>
  );
}

/** Ustun qo'shish — sarlavha VA har satr birga o'sadi (refine sharti). */
function addColumn(block: TableBlockValue, header: string): TableBlockValue {
  return {
    ...block,
    headers: [...block.headers, header],
    rows: block.rows.map((row) => [...row, ""]),
  };
}

/** Ustun o'chirish — sarlavha VA har satrdan ayni indeks olinadi. */
function removeColumn(block: TableBlockValue, index: number): TableBlockValue {
  return {
    ...block,
    headers: block.headers.filter((_, i) => i !== index),
    rows: block.rows.map((row) => row.filter((_, i) => i !== index)),
  };
}

/**
 * Sarlavhalar va kataklar panjarasi.
 *
 * Telefonda jadval o'zi gorizontal suriladi, sahifa emas — ko'ruvchidagi
 * (`components/generation/document-blocks.tsx:79`) ayni naqsh.
 */
function TableGrid({ block, onChange }: BlockEditorProps<"table">) {
  const tE = useTranslations("Editor");

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {block.headers.map((header, column) => (
            <div key={column} className="flex min-w-40 flex-col gap-1">
              <Input
                value={header}
                maxLength={120}
                aria-label={`${tE("field.headers")} ${String(column + 1)}`}
                aria-invalid={header.trim().length === 0}
                className="h-11 font-medium"
                onChange={(event) => {
                  onChange({
                    ...block,
                    headers: block.headers.map((item, i) =>
                      i === column ? event.target.value : item,
                    ),
                  });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="touch"
                aria-label={tE("field.removeColumn")}
                disabled={block.headers.length <= 1}
                onClick={() => {
                  onChange(removeColumn(block, column));
                }}
              >
                <Trash2 className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>

        {block.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-2">
            {row.map((cell, column) => (
              <Input
                key={column}
                value={cell}
                maxLength={500}
                aria-label={`${String(rowIndex + 1)}-${String(column + 1)}`}
                className="h-11 min-w-40"
                onChange={(event) => {
                  onChange({
                    ...block,
                    rows: block.rows.map((item, i) =>
                      i === rowIndex
                        ? item.map((value, j) => (j === column ? event.target.value : value))
                        : item,
                    ),
                  });
                }}
              />
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={tE("field.removeRow")}
              disabled={block.rows.length <= 1}
              onClick={() => {
                onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIndex) });
              }}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
