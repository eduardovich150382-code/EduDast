"use client";

import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BlockEditorProps } from "@/components/editor/blocks/props";
import { buttonVariants } from "@/components/ui/button";
import { gameItemCount } from "@/lib/games/content";
import { GAMES } from "@/lib/games/registry";
import { Link } from "@/lib/i18n/navigation";

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
 * HAVOLALAR `documentId` NI TALAB QILADI, blok esa uni bilmaydi —
 * shuning uchun u prop sifatida keladi (`document-editor.tsx` dan
 * `BlockEditor` orqali). Varaq havolasi FAQAT varaqli o'yinlarda
 * ko'rsatiladi: g'ildirak uchun varaq yo'q va qaror
 * `GAMES[kind].hasSheet` da yashaydi.
 */
export function GameBlock({ block, documentId }: BlockEditorProps<"game"> & { documentId: string }) {
  const tE = useTranslations("Editor");
  const tG = useTranslations("Games");

  const kind = block.content.kind;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <Gamepad2 className="size-5 shrink-0 text-ink-2" strokeWidth={1.5} />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{tG(`kind.${kind}`)}</span>
          <span className="text-sm text-ink-2">
            {tE("field.gameItems", { count: gameItemCount(block.content) })}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/ish/hujjat/${documentId}/oyin`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {tG("open")}
        </Link>

        {GAMES[kind].hasSheet && (
          <Link
            href={`/ish/hujjat/${documentId}/varaq`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {tG("openSheet")}
          </Link>
        )}
      </div>
    </div>
  );
}
