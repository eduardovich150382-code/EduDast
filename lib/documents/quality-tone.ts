import type { DocumentStatus } from "@/lib/generated/prisma/client";
import { SCORE_FAIL, SCORE_WARN } from "@/lib/generation/quality";

/**
 * Hujjat kartasidagi belgi ohangi.
 *
 * Chegaralar `lib/generation/quality.ts` dan IMPORT QILINADI, qayta
 * yozilmaydi. Sabab: `app/[locale]/ish/hujjat/[id]/page.tsx` past sifat
 * ogohlantirishini aynan `SCORE_WARN` bo'yicha ko'rsatadi. Agar chegara bu
 * yerda literal bo'lsa, kelajakda `quality.ts` da o'zgartirilganda ro'yxatdagi
 * belgi bilan hujjat ichidagi ogohlantirish jimgina ajralib ketardi —
 * o'qituvchi ro'yxatda "sifat yaxshi" ko'rib, ichida ogohlantirish topardi.
 * Test ham shu importlarga qarab tekshiradi.
 *
 * `quality.ts` sof modul (DB yo'q), shuning uchun server componentga import
 * qilish xavfsiz.
 */

export type QualityTone = "neutral" | "ok" | "warn" | "fail";

export function qualityTone(
  status: DocumentStatus,
  score: number | null,
): QualityTone {
  // Tugamagan hujjatda sifat balli hali ma'nosiz: `finishDocument()` uni
  // faqat oxirgi bosqichda yozadi.
  if (status === "QUEUED" || status === "RUNNING") return "neutral";
  if (status === "FAILED") return "fail";

  // Bundan keyin status === "DONE".
  if (score === null) return "neutral";
  if (score >= SCORE_WARN) return "ok";
  // `SCORE_FAIL` dan past `DONE` hujjat amalda bo'lmasligi kerak
  // (`scoreDocument` uni yiqitadi), lekin ball formulasi o'zgarsa bu tarmoq
  // belgi umuman ko'rinmay qolishidan saqlaydi.
  if (score >= SCORE_FAIL) return "warn";
  return "fail";
}
