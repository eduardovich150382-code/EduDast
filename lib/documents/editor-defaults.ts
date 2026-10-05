import type { Block, BlockType } from "@/lib/documents/blocks";
import { numbered, type DefaultLabels } from "@/lib/documents/editor-labels";

/**
 * "Yangi blok" standart qiymatlari (13-sessiya, 2-band).
 *
 * ENG MUHIM SHART: har standart qiymat YARATILGAN ZAHOTI `Block` sxemasidan
 * o'tishi kerak. Sabab avtosaqlash darvozasida: muharrir butun
 * `DocumentContent` ni bitta bo'lak sifatida saqlaydi, demak bitta nosog'lom
 * blok BUTUN hujjatning saqlanishini to'xtatadi. Agar yangi blok bo'sh matn
 * bilan tug'ilsa (`txt` esa `min(1)` talab qiladi), "blok qo'shish" amali
 * o'qituvchining boshqa joyda yozgan matnini ham saqlanmaydigan holatga
 * olib kelardi.
 *
 * Shu sababli chegaralar ham hurmat qilinadi: `stages` ikki element bilan
 * (`min(2)`), `table` satrlari sarlavhalar soniga teng, `question` esa
 * `short` turida (yagona kesishma qoidasiz tarmoq) tug'iladi.
 *
 * `tests/documents-editor.test.ts` buni o'n ikki tur bo'ylab qadaydi.
 */

/**
 * Yangi blok. `null` — bu turni HOZIR qo'shib bo'lmaydi.
 *
 * `answerKey` yagona shunday tur: uning `items[].questionId` mavjud savolga
 * ishora qilishi kerak (`Id` `min(1)`), savolsiz hujjatda esa ishora
 * qilinadigan narsa yo'q. Soxta `"-"` yozish sxemadan o'tardi, lekin
 * eksport va o'yin uni savol deb izlab topolmasdi. Qo'shish menyusi shu
 * `null` ni ko'rib bandni o'chirilgan holatda ko'rsatadi.
 */
export function newBlock(
  type: BlockType,
  id: string,
  labels: DefaultLabels,
  blocks: readonly Block[],
): Block | null {
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: labels.heading };

    case "paragraph":
      return { id, type, text: labels.text };

    case "list":
      return { id, type, style: "bullet", items: [labels.item] };

    case "table":
      // Katak BO'SH bo'lishi mumkin (`blocks.ts:76`), sarlavha esa yo'q.
      // Satr kengligi sarlavhalar soniga TENG bo'lishi shart (refine).
      return {
        id,
        type,
        headers: [numbered(labels.column, 1), numbered(labels.column, 2)],
        rows: [["", ""]],
      };

    case "objectives":
    case "materials":
    case "homework":
      return { id, type, items: [labels.item] };

    case "stages":
      return {
        id,
        type,
        items: [1, 2].map((i) => ({
          title: numbered(labels.stage, i),
          minutes: 10,
          teacherActions: [labels.item],
          studentActions: [labels.item],
        })),
      };

    case "question":
      // `short` — `pairs` BUTUNLAY tashlangan holda (`[]` ham "berilgan"
      // hisoblanadi, `blocks.ts:192`).
      return {
        id,
        type,
        kind: "short",
        text: labels.question,
        options: [],
        answer: labels.answer,
        points: 1,
        bloom: "understand",
      };

    case "answerKey": {
      const questions = blocks.filter((block) => block.type === "question");
      if (questions.length === 0) return null;
      // Javoblar mavjud savollardan URUG'LANADI: shundan o'qituvchi
      // tahrirlashni noldan emas, tayyor ro'yxatdan boshlaydi.
      return {
        id,
        type,
        items: questions.slice(0, 50).map((question) => ({
          questionId: question.id,
          answer: question.answer,
        })),
      };
    }

    case "rubric":
      return {
        id,
        type,
        criteria: [{ name: labels.criterion, maxPoints: 5, descriptors: [labels.item] }],
      };

    case "note":
      return { id, type, tone: "info", text: labels.text };
  }
}
