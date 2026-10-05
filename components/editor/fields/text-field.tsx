"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Muharrirning matn maydoni.
 *
 * `"use client"` TEXNIK JIHATDAN SHART EMAS (bu fayl faqat
 * `document-editor.tsx` daraxtidan import qilinadi, u esa chegarani
 * allaqachon ochgan), lekin `tests/client-props-guard.test.ts` direktivasiz
 * faylni SERVER komponent deb hisoblaydi va klient primitiviga uzatilgan
 * `onChange` ni buzilish deb belgilaydi. Direktiva — qorovulga ham, keyingi
 * o'quvchiga ham niyatni aytadigan eng arzon yo'l. Muharrirning HAMMA
 * fayllarida shu sabab bilan turadi.
 *
 * BO'SH MAYDON = NOSOG'LOM: `blocks.ts` dagi `txt()` har matndan bo'sh
 * bo'lmaslikni talab qiladi (`min(1)`), shuning uchun bo'sh maydon darhol
 * `aria-invalid` oladi — o'qituvchi saqlash to'xtaganini qaysi maydon
 * sababli bo'lganini ko'rib turadi. Xabar matni YO'Q: Zod xabarlari
 * o'zbekcha va uchala tilga tarjimasi yo'q (1-qoida).
 *
 * `h-11` ATAYLAB `Input` ustidan: primitivda `h-8`, telefonda esa 44 px
 * kerak (`app/[locale]/ish/hujjatlar/page.tsx` ham shunday qiladi).
 */
export function TextField({
  label,
  value,
  maxLength,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const invalid = value.trim().length === 0;

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {multiline ? (
        <Textarea
          value={value}
          maxLength={maxLength}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={value}
          maxLength={maxLength}
          aria-invalid={invalid}
          className="h-11"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
