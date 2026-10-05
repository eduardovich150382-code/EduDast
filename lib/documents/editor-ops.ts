import type { Block, DocumentContent } from "@/lib/documents/blocks";

/**
 * Muharrirning blok amallari — SOF funksiyalar (13-sessiya, 2-band).
 *
 * Ro'yxat ataylab qisqa va spekdagi beshlikning aynan o'zi: tahrirlash,
 * o'chirish, yuqoriga/pastga ko'chirish, nusxalash, qo'shish. Sudrab
 * tashlash, orqaga qaytarish va versiyalar YO'Q.
 *
 * Hammasi immutabel: React holati `useState<DocumentContent>` da turadi,
 * demak joyida o'zgartirish qayta renderni keltirmasdi. `v` tegilmaydi —
 * u hujjat YARATILGANDA yoziladi (`blocks.ts:291`).
 *
 * Chegaradan chiqqan indeks JIM qaytaradi (xato otmaydi): tugma bosilishi
 * bilan holat o'zgarishi o'rtasida poyga bo'lishi mumkin va bitta noto'g'ri
 * indeks butun muharrirni yiqitmasligi kerak.
 */

function withBlocks(content: DocumentContent, blocks: Block[]): DocumentContent {
  return { v: content.v, blocks };
}

function inRange(content: DocumentContent, index: number): boolean {
  return index >= 0 && index < content.blocks.length;
}

/** Bitta blokni almashtirish — har maydon tahriri shu yerdan o'tadi. */
export function replaceBlock(
  content: DocumentContent,
  index: number,
  block: Block,
): DocumentContent {
  if (!inRange(content, index)) return content;
  const blocks = [...content.blocks];
  blocks[index] = block;
  return withBlocks(content, blocks);
}

export function removeBlock(content: DocumentContent, index: number): DocumentContent {
  if (!inRange(content, index)) return content;
  return withBlocks(
    content,
    content.blocks.filter((_, i) => i !== index),
  );
}

/**
 * Yuqoriga (`-1`) yoki pastga (`1`) ko'chirish.
 *
 * Birinchi blokni yuqoriga yoki oxirgisini pastga ko'chirish urinishi
 * kontentni O'ZGARTIRMAYDI — qobiq tugmani `disabled` qiladi, bu esa
 * ikkinchi qavat.
 */
export function moveBlock(
  content: DocumentContent,
  index: number,
  dir: -1 | 1,
): DocumentContent {
  const target = index + dir;
  if (!inRange(content, index) || !inRange(content, target)) return content;
  const blocks = [...content.blocks];
  const moved = blocks[index];
  const displaced = blocks[target];
  if (moved === undefined || displaced === undefined) return content;
  blocks[index] = displaced;
  blocks[target] = moved;
  return withBlocks(content, blocks);
}

/**
 * Nusxani ASLINING ORQASIGA qo'yadi.
 *
 * `newId` chaqiruvchidan keladi (`newBlockId(takenIds(...))`): id yasash
 * `Date.now()` ga bog'liq, sof funksiya ichida esa uni testlab bo'lmaydi.
 * Chuqur nusxa `structuredClone` bilan — `stages`/`table` kabi ichma-ich
 * bloklarda sayoz nusxa ikki blokni bitta massivga bog'lab qo'yardi va
 * birini tahrirlash ikkinchisini ham o'zgartirardi.
 */
export function duplicateBlock(
  content: DocumentContent,
  index: number,
  newId: string,
): DocumentContent {
  if (!inRange(content, index)) return content;
  const source = content.blocks[index];
  if (source === undefined) return content;
  const copy = { ...structuredClone(source), id: newId };
  const blocks = [...content.blocks];
  blocks.splice(index + 1, 0, copy);
  return withBlocks(content, blocks);
}

/** Yangi blok OXIRIGA qo'shiladi; joyini ko'chirish tugmalari hal qiladi. */
export function appendBlock(content: DocumentContent, block: Block): DocumentContent {
  return withBlocks(content, [...content.blocks, block]);
}
