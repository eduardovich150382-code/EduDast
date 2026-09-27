import type { Block, DocumentContent } from "./blocks";

/**
 * Bloklardan SOF MATN yasaydigan YAGONA joy.
 *
 * Uchta iste'molchi shu funksiyaga tayanadi:
 *   - `lib/generation/quality.ts` — sifat bahosi (kalit so'z qamrovi, til,
 *     markdown artefaktlari) aynan shu matn ustida ishlaydi;
 *   - eksport (12-sessiya) — DOCX/PDF matn qatlami;
 *   - qidiruv (keyingi sessiyalar) — indekslanadigan matn.
 *
 * Agar bu uch joy o'z nusxasini yozsa, sifat bahosi eksportda ko'rinmaydigan
 * matnni baholab, foydalanuvchiga tushunarsiz ball berardi.
 *
 * DETERMINISTIK: vaqt tamg'asi yo'q, `Date` yo'q, locale'ga bog'liq
 * formatlash yo'q (`toLocaleString` EMAS, `String(n)`). Bir xil bloklar bir
 * xil satr beradi — `tests/documents-render.test.ts` shuni tekshiradi.
 *
 * MARKDOWN CHIQARMAYDI. Chiqish — o'qiladigan sof matn: `**` yoki `##`
 * qo'ysak, `quality.ts` dagi markdown detektori o'z chiqishimizni jarima
 * qilardi (CLAUDE.md "Qilma": hujjat markdown sifatida saqlanmaydi).
 */

/** Ro'yxat elementi oldidagi belgi — markdown `- ` EMAS. */
const BULLET = "• ";

function lines(block: Block): string[] {
  switch (block.type) {
    case "heading":
      return [block.text];

    case "paragraph":
      return [block.text];

    case "list":
      return block.items.map((item, i) =>
        block.style === "ordered" ? `${i + 1}. ${item}` : `${BULLET}${item}`,
      );

    case "table": {
      const out: string[] = [];
      if (block.caption) out.push(block.caption);
      // Katakchalar tabulyatsiya bilan: ustun kengligini hisoblash
      // chiqishni ma'lumotga bog'liq qilardi (bir katak uzaysa butun jadval
      // qayta tekislanib, "o'zgarmagan" matn o'zgarib ketardi).
      out.push(block.headers.join("\t"));
      for (const row of block.rows) out.push(row.join("\t"));
      return out;
    }

    case "objectives":
      return block.items.map((item) => `${BULLET}${item}`);

    case "materials":
      return block.items.map((item) => `${BULLET}${item}`);

    case "stages":
      return block.items.flatMap((stage) => [
        `${stage.title} (${String(stage.minutes)} daqiqa)`,
        ...stage.teacherActions.map((action) => `${BULLET}O'qituvchi: ${action}`),
        ...stage.studentActions.map((action) => `${BULLET}O'quvchi: ${action}`),
      ]);

    case "question": {
      const out = [block.text];
      for (const option of block.options) out.push(`${BULLET}${option}`);
      out.push(`Javob: ${block.answer}`);
      return out;
    }

    case "answerKey":
      return block.items.map((item) =>
        item.explanation
          ? `${item.questionId}: ${item.answer} — ${item.explanation}`
          : `${item.questionId}: ${item.answer}`,
      );

    case "rubric":
      return block.criteria.flatMap((criterion) => [
        `${criterion.name} (${String(criterion.maxPoints)} ball)`,
        ...criterion.descriptors.map((descriptor) => `${BULLET}${descriptor}`),
      ]);

    case "homework": {
      const out = block.items.map((item) => `${BULLET}${item}`);
      if (block.estimatedMinutes !== undefined) {
        out.push(`Taxminiy vaqt: ${String(block.estimatedMinutes)} daqiqa`);
      }
      return out;
    }

    case "note":
      return [block.text];
  }
}

/** Bitta blokning matni. Bloklar orasidagi ajratgich — chaqiruvchida. */
export function renderBlock(block: Block): string {
  return lines(block).join("\n");
}

/**
 * Butun hujjatning matni. Bloklar bo'sh qator bilan ajratiladi.
 *
 * Bo'sh bloklar (masalan matnsiz `table`) chiqishga bo'sh satr qo'shmaydi —
 * aks holda ketma-ket bo'sh qatorlar kalit so'z qamrovi hisobiga shovqin
 * kiritardi.
 */
export function renderDocument(content: DocumentContent): string {
  return content.blocks
    .map(renderBlock)
    .filter((text) => text.length > 0)
    .join("\n\n");
}
