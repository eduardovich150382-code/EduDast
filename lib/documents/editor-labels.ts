/**
 * Muharrir yangi blok yasaganda ishlatadigan matnlar.
 *
 * NEGA PROP, `lib/` ICHIDA QOTIRILGAN SATR EMAS: 1-qoida (hardcode matn
 * yo'q) `lib/` ga ham tegishli. Bu matnlar hujjat KONTENTIGA tushadi, ya'ni
 * o'qituvchi qaysi tilda ishlayotgan bo'lsa o'sha tilda bo'lishi kerak.
 * Klient ildizi (`components/editor/document-editor.tsx`) ularni
 * `Editor.defaults.*` dan yig'adi va shu obyektni uzatadi.
 *
 * Tarjima FUNKSIYASI uzatilmaydi, faqat tayyor satrlar: sof `lib` moduli
 * `next-intl` ga bog'lanib qolmasligi kerak.
 *
 * Raqamlash (`Variant 1`, `Ustun 2`) `lib` ichida qo'shiladi — uchala tilda
 * ham son yorliqdan keyin turadi, shuning uchun alohida kalit kerak emas.
 */
export type DefaultLabels = Readonly<
  Record<
    | "heading"
    | "text"
    | "item"
    | "question"
    | "answer"
    | "option"
    | "column"
    | "stage"
    | "criterion"
    | "pairLeft"
    | "pairRight",
    string
  >
>;

/** `Variant` + raqam. */
export function numbered(label: string, index: number): string {
  return `${label} ${String(index)}`;
}
