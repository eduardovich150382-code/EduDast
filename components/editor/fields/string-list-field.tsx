"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Satrlar ro'yxati maydoni — muharrirda eng ko'p ishlatiladigan g'isht
 * (`list.items`, `objectives`, `materials`, `homework`, `options`,
 * `teacherActions`, `studentActions`, `descriptors`).
 *
 * CHEGARALAR HURMAT QILINADI: `blocks.ts` da har ro'yxat `min`/`max` bilan
 * keladi (masalan `objectives` — `min(1).max(10)`). Chegaraga yetganda
 * tugma `disabled` bo'ladi, ya'ni o'qituvchi hujjatni sxemadan chiqarib
 * yubora olmaydi. Bu bitta amalni bloklash — butun hujjatning saqlanishini
 * to'xtatishdan ko'ra yaxshi.
 *
 * `defaultValue` EMAS, `value`: qiymat haqiqat manbai yuqorida
 * (`useState<DocumentContent>`), bu yerda esa faqat ko'rinish.
 */
export function StringListField({
  label,
  items,
  min,
  max,
  maxLength,
  multiline = false,
  addLabel,
  removeLabel,
  onChange,
}: {
  label: string;
  items: readonly string[];
  min: number;
  max: number;
  maxLength: number;
  multiline?: boolean;
  addLabel: string;
  removeLabel: string;
  onChange: (items: string[]) => void;
}) {
  function replaceAt(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-2">{label}</span>

      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              value={item}
              maxLength={maxLength}
              aria-label={`${label} ${String(index + 1)}`}
              aria-invalid={item.trim().length === 0}
              onChange={(event) => replaceAt(index, event.target.value)}
            />
          ) : (
            <Input
              value={item}
              maxLength={maxLength}
              aria-label={`${label} ${String(index + 1)}`}
              aria-invalid={item.trim().length === 0}
              className="h-11"
              onChange={(event) => replaceAt(index, event.target.value)}
            />
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={removeLabel}
            disabled={items.length <= min}
            onClick={() => {
              onChange(items.filter((_, i) => i !== index));
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        disabled={items.length >= max}
        onClick={() => {
          onChange([...items, ""]);
        }}
      >
        <Plus className="size-4" strokeWidth={1.5} />
        {addLabel}
      </Button>
    </div>
  );
}
