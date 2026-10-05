/**
 * Muharrir qo'shadigan blok identifikatorlari (13-sessiya).
 *
 * NEGA `blockId()` DAN ALOHIDA: `blocks.ts:318` dagi `blockId()` ATAYLAB
 * deterministik — bosqich qayta bajarilsa ayni id qayta yasaladi va
 * takroriy-id refine'i ikkinchi yozuvni ushlaydi. Muharrirda esa aksincha
 * kerak: o'qituvchi blok qo'shganda yoki nusxalaganda id HAR SAFAR yangi
 * bo'lishi shart, aks holda `DocumentContent` ning takroriy-id refine'i
 * saqlashni rad etadi.
 *
 * `e` prefiksi `blockId()` yasagan `s<bosqich>-<tur>-<n>` bilan hech qachon
 * to'qnashmaydi, ya'ni generatsiya qilgan va qo'lda qo'shilgan bloklar bir
 * fazoda yashay oladi.
 */

/**
 * Band bo'lmagan yangi blok id.
 *
 * `taken` — hujjatdagi MAVJUD id lar. Bir millisekundda bir nechta blok
 * qo'shilsa (nusxalash + qo'shish ketma-ket) `Date.now()` o'zgarmaydi,
 * shuning uchun hisoblagich qo'shiladi.
 *
 * Uzunlik ~12 belgi — `Id` ning `max(64)` chegarasidan ancha past.
 */
export function newBlockId(taken: ReadonlySet<string>): string {
  const stamp = Date.now().toString(36);
  for (let n = 0; ; n += 1) {
    const id = `e${stamp}${n.toString(36)}`;
    if (!taken.has(id)) return id;
  }
}

/** Kontentdagi band id lar — `newBlockId` ga beriladi. */
export function takenIds(blocks: readonly { id: string }[]): ReadonlySet<string> {
  return new Set(blocks.map((block) => block.id));
}
