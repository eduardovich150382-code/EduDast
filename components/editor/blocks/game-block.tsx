"use client";

import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { gameItemCount } from "@/lib/games/content";

/**
 * O'yin bloki — FAQAT O'QISH uchun karta (15-sessiya).
 *
 * NEGA TAHRIRLANMAYDI: o'yin mazmuni (so'z–ta'rif juftliklari) sehrgar
 * orqali mavzudan olinadi, panjara va aralashma esa `seed` dan hisoblanadi.
 * Tahrirlash uchun har o'yin turiga alohida muharrir kerak bo'lardi, 15-sessiya
 * hajmi esa shunisiz ham katta (uch algoritm + ikki pleyer + testlar + i18n).
 *
 * "Qayta aralashtirish" tugmasi ham kerak emas: `?variant=N` bir xil
 * mazmundan boshqa panjara beradi, ya'ni o'qituvchi uni URL'dan oladi va
 * muharrirda `seed` ni o'zgartirish hujjatni qayta saqlashni talab qilardi.
 *
 * Blok `lib/documents/editor-defaults.ts` da `null` qaytaradi, ya'ni qo'shish
 * menyusidan yangi o'yin bloki tug'ilmaydi — bu karta FAQAT sehrgar yozgan
 * blokni ko'rsatadi.
 *
 * Doska va varaq havolalari bu kartada YO'Q: ular `/oyin` va `/varaq`
 * marshrutlari paydo bo'lgandan keyin qo'shiladi (Next 16 `<Link href>` ni
 * `.next/types` da mavjud marshrutlarga qarab tekshiradi).
 */
export function GameBlock({ block }: BlockEditorProps<"game">) {
  const tE = useTranslations("Editor");
  const tG = useTranslations("Games");

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <Gamepad2 className="size-5 shrink-0 text-ink-2" strokeWidth={1.5} />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-ink">{tG(`kind.${block.content.kind}`)}</span>
        <span className="text-sm text-ink-2">
          {tE("field.gameItems", { count: gameItemCount(block.content) })}
        </span>
      </div>
    </div>
  );
}
