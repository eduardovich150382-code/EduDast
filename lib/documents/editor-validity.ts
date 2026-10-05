import { DocumentContent } from "@/lib/documents/blocks";

/**
 * Muharrirning saqlash darvozasi (13-sessiya, 3-band).
 *
 * MUAMMO: `txt()` har matn maydonidan bo'sh bo'lmaslikni talab qiladi
 * (`blocks.ts:34`), `question` da esa kesishma qoidalar bor. Ya'ni
 * o'qituvchi maydonni tozalab yangi matn yozmoqchi bo'lgan har bir lahzada
 * `DocumentContent` nosog'lom bo'ladi. Darvoza bo'lmasa avtosaqlash har
 * 1.5 soniyada serverga BILIB rad etiladigan so'rov yuborardi va toast
 * bo'roni qilardi.
 *
 * SXEMA NUSXALANMAYDI: shu yerda ayni `DocumentContent` import qilinadi,
 * ya'ni klient darvozasi va server validatsiyasi bitta manbadan oziqlanadi
 * va vaqt o'tib ajralib ketolmaydi. `blocks.ts` sof zod moduli (DB yo'q,
 * server importi yo'q), shuning uchun klientga qo'shilishi xavfsiz.
 *
 * DARVOZA QOROVOL EMAS: `server/document-actions.ts` o'z Zod tekshiruvini
 * saqlab qoladi (CLAUDE.md 6-qoida). Bu yerdagi tekshiruv faqat UX uchun.
 *
 * ZOD XABARLARI UI GA CHIQMAYDI: ular `blocks.ts` dagi o'zbekcha satrlar,
 * uchala tilga tarjimasi yo'q (1-qoida). Shuning uchun natija faqat QAYSI
 * blok nosog'lom ekanini aytadi; nega — kartadagi umumiy izoh va bo'sh
 * maydondagi `aria-invalid` bilan ko'rsatiladi.
 */

export type ContentIssues = {
  /** Nosog'lom bloklarning id lari. */
  readonly blockIds: ReadonlySet<string>;
  /**
   * Blok darajasidan YUQORI xato: takroriy id (`blocks.ts:301`) yoki
   * `max(400)`. Bunda aybdor blokni ko'rsatib bo'lmaydi, shuning uchun
   * ogohlantirish hujjat darajasida chiqadi.
   */
  readonly document: boolean;
};

/** Sog'lom bo'lsa `null`. */
export function contentIssues(content: DocumentContent): ContentIssues | null {
  const parsed = DocumentContent.safeParse(content);
  if (parsed.success) return null;

  const blockIds = new Set<string>();
  let document = false;

  for (const issue of parsed.error.issues) {
    // `["blocks", 3, "items", 0]` -> uchinchi blok. Qisqaroq yo'l
    // (`["blocks"]` yoki `[]`) butun hujjatga tegishli.
    const [head, index] = issue.path;
    if (head !== "blocks" || typeof index !== "number") {
      document = true;
      continue;
    }
    const block = content.blocks[index];
    if (block === undefined) {
      document = true;
      continue;
    }
    blockIds.add(block.id);
  }

  return { blockIds, document };
}
