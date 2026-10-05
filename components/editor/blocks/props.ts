import type { Block, BlockType } from "@/lib/documents/blocks";

/**
 * Blok tahrirlagichlarining umumiy shartnomasi.
 *
 * `onChange` TO'LIQ blokni qaytaradi, patch emas: `document-editor.tsx`
 * uni `replaceBlock` ga uzatadi, bu esa `Block` union'ining bir butun
 * a'zosini kutadi. Qismli yangilash union tarmoqlarini aralashtirib
 * yuborishi mumkin edi (masalan `question.kind` o'zgarib, `options` eski
 * tarmoqdan qolib ketishi).
 *
 * Funksiya prop KLIENTDAN KLIENTGA uzatiladi, shuning uchun ruxsat etilgan —
 * `tests/client-props-guard.test.ts` faqat server -> klient yo'nalishini
 * bloklaydi.
 */
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export type BlockEditorProps<T extends BlockType> = {
  block: BlockOf<T>;
  onChange: (block: Block) => void;
};
