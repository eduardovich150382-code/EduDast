"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Butun son maydoni (daqiqa, ball, taxminiy vaqt).
 *
 * YOZILAYOTGAN MATN MAHALLIY HOLATDA: maydon `value` ni to'g'ridan-to'g'ri
 * ko'rsatganda sonni tahrirlash imkonsiz bo'lardi — "10" dan "25" ga o'tish
 * uchun maydonni tozalash kerak, bo'sh matn esa `NaN` beradi va blok
 * sxemadan o'tmay qoladi, ya'ni BUTUN hujjat saqlanmaydigan holatga
 * tushardi. Shuning uchun matn erkin yoziladi, yuqoriga esa faqat
 * CHEGARA ICHIDAGI butun son uzatiladi.
 *
 * `useEffect` bilan tashqi qiymatga moslashtirish KERAK EMAS: `value` ni
 * faqat shu maydonning o'zi o'zgartiradi, nusxalash esa `block.id` kaliti
 * orqali yangi komponent yasaydi va holat o'zi toza boshlanadi.
 *
 * Fokusdan chiqqanda nosog'lom matn oxirgi QABUL QILINGAN qiymatga
 * qaytadi — ekranda saqlanmagan son qolib ketmasin.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));

  function handleChange(raw: string) {
    setText(raw);
    const next = Number.parseInt(raw, 10);
    if (!Number.isInteger(next) || next < min || next > max) return;
    onChange(next);
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        className="h-11 w-24"
        aria-invalid={String(value) !== text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}
