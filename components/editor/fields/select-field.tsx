"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Enum maydoni: sarlavha darajasi, ro'yxat ko'rinishi, savol turi, ohang,
 * Bloom darajasi.
 *
 * `options` tayyor yorliqlar bilan keladi (`{ value, label }`), chunki
 * yorliqlar `Editor.enum.*` dan olinadi va `lib` ga tarjima funksiyasi
 * uzatilmaydi.
 *
 * `onValueChange` `string | null` beradi (`components/locale-switcher.tsx`
 * naqshi), shuning uchun `null` jim tashlanadi.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === null) return;
          onChange(next as T);
        }}
      >
        <SelectTrigger aria-label={label} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
