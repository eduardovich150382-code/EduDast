import type { Block, DocumentContent } from "@/lib/documents/blocks";

/**
 * Hujjat kontentidan o'yin blokini ajratib oladi (15-sessiya).
 *
 * NEGA SOF MODUL: `lib/slides/deck.ts:4-12` dagi ayni qaror — bu loyihada
 * React test muhiti yo'q, shuning uchun testlanadigan mantiq
 * komponentdan va sahifadan CHIQARILADI.
 */

export type GameBlock = Extract<Block, { type: "game" }>;

/**
 * BIRINCHI `game` bloki, yoki `null`.
 *
 * Hujjatda bitta o'yin bloki bo'ladi (`plans-game.ts` bittasini yozadi),
 * lekin bu blok sxemasida QULFLANMAGAN: cheklov `DocumentContent`
 * darajasida bo'lardi va faqat bitta blok turiga tegishli maxsus qoida
 * yasardi. Shuning uchun pleyer birinchisini oladi — muharrir orqali
 * ikkinchi blok paydo bo'lsa ham sahifa ishlashda davom etadi.
 */
export function firstGameBlock(content: DocumentContent): GameBlock | null {
  return content.blocks.find((block): block is GameBlock => block.type === "game") ?? null;
}

/** Hujjatning sarlavha bloklaridan birinchisi — varaq boshidagi nom uchun. */
export function documentHeading(content: DocumentContent): string | null {
  const heading = content.blocks.find((block) => block.type === "heading");
  return heading?.type === "heading" ? heading.text : null;
}
