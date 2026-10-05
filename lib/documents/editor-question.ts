import type { Block } from "@/lib/documents/blocks";
import { numbered, type DefaultLabels } from "@/lib/documents/editor-labels";

export type QuestionBlock = Extract<Block, { type: "question" }>;
export type QuestionKind = QuestionBlock["kind"];

/**
 * Savol TURI almashganda bog'liq maydonlarni tuzatish (13-sessiya).
 *
 * NEGA KERAK: `blocks.ts:150-201` dagi `superRefine` kesishma qoidalar
 * qo'yadi va ular turga qarab BIR-BIRINI RAD ETADI:
 *
 *   mcq       -> kamida 3 ta TURLI variant VA javob variantlar ichida
 *   truefalse -> `options` bo'sh
 *   match     -> `pairs` bor (>=2) VA `options` bo'sh
 *   short     -> qo'shimcha qoida yo'q
 *   match'dan boshqa har turda `pairs` BUTUNLAY yo'q ([] ham "berilgan")
 *
 * Ya'ni `mcq` dan `match` ga o'tganda faqat `kind` ni o'zgartirish kontentni
 * DARHOL nosog'lom qiladi: `options` to'la qoladi va saqlash to'xtaydi.
 * O'qituvchi esa sababini ko'rmaydi — u shunchaki ro'yxatdan boshqa turni
 * tanlagan edi. Shu funksiya o'tishni har ikki tomonda ham valid qiladi.
 */
export function withQuestionKind(
  question: QuestionBlock,
  kind: QuestionKind,
  labels: DefaultLabels,
): QuestionBlock {
  if (question.kind === kind) return question;

  // `base` ATAYLAB qo'lda yig'ilgan, `{ pairs, ...rest }` destrukturizatsiya
  // EMAS: `pairs` ni TASHLAB KETISH kerak, `undefined` qilib qo'yish emas —
  // `strictObject` uchun mavjud kalit `undefined` qiymat bilan ham
  // "berilgan" hisoblanadi. Qo'lda yig'ish buni ko'rinadigan qiladi.
  const base = {
    id: question.id,
    type: question.type,
    text: question.text,
    answer: question.answer,
    points: question.points,
    bloom: question.bloom,
  };

  switch (kind) {
    case "mcq": {
      // Mavjud variantlardan TURLI uchtasini saqlab qolamiz, kamini
      // standart yorliq bilan to'ldiramiz — o'qituvchi yozgan matn
      // bekorga ketmasin.
      const options = fillOptions(question.options, labels);
      return { ...base, kind, options, answer: options[0] ?? question.answer };
    }

    case "match":
      return {
        ...base,
        kind,
        options: [],
        pairs: question.pairs ?? [
          { left: numbered(labels.pairLeft, 1), right: numbered(labels.pairRight, 1) },
          { left: numbered(labels.pairLeft, 2), right: numbered(labels.pairRight, 2) },
        ],
      };

    case "truefalse":
    case "short":
      return { ...base, kind, options: [] };
  }
}

/** Kamida 3 ta TURLI variant. Takrorlar tashlanadi (`new Set` qoidasi). */
function fillOptions(existing: readonly string[], labels: DefaultLabels): string[] {
  const options = [...new Set(existing)];
  // Yorliq o'qituvchi yozgan matn bilan to'qnashishi mumkin, shuning uchun
  // son to'xtamasdan suriladi — "3 ta TURLI" shartining o'zi sanoqchi.
  for (let n = 1; options.length < 3; n += 1) {
    const candidate = numbered(labels.option, n);
    if (!options.includes(candidate)) options.push(candidate);
  }
  return options;
}
