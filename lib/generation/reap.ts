import { release } from "@/lib/credits/ledger";
import { findStaleDocuments, STALE_MINUTES } from "@/lib/documents/lifecycle";
import { prisma } from "@/lib/db";

/**
 * Yetim `RUNNING` hujjatlarni `FAILED` qiladi va band kreditni qaytaradi.
 *
 * NEGA ASOSAN O'QISHDA, CRON'DA EMAS: Vercel Hobby'da cron KUNIGA BIR marta
 * ishlaydi (`vercel.json`), ya'ni "RUNNING > 15 daqiqa -> FAILED" va'dasini
 * cron bajara olmaydi. Yetim hujjati bor foydalanuvchi — aynan holatni
 * so'rab turgan odam, shuning uchun tozalash uning o'z so'rovida (`after()`
 * ichida, javobni kechiktirmasdan) bajariladi.
 * `app/api/cron/stale-documents` esa qaytmaydigan foydalanuvchilar uchun
 * ZAXIRA qavat.
 *
 * Konveyerning O'ZIDA uchinchi qavat bor: 90 soniyalik ijara
 * (`lib/documents/lifecycle.ts`). Holatlarning ko'pchiligi u yerda hal
 * bo'ladi va bu funksiyagacha yetib kelmaydi.
 */

/** Bitta o'qishda tozalanadigan eng ko'p hujjat — javob sekinlashmasin. */
const READ_PATH_LIMIT = 5;

/** Cron bitta yugurishda tozalaydigan eng ko'p hujjat. */
export const CRON_LIMIT = 100;

export type ReapResult = { reaped: number; failed: number };

/**
 * @param userId `null` — hamma foydalanuvchi (faqat cron shunday chaqiradi).
 */
export async function reapStaleDocuments(
  userId: string | null,
  limit: number = userId === null ? CRON_LIMIT : READ_PATH_LIMIT,
): Promise<ReapResult> {
  const stale = await findStaleDocuments(prisma, { userId, limit });

  let reaped = 0;
  let failed = 0;

  for (const doc of stale) {
    try {
      // `release` statusni O'ZI `FAILED` qiladi — oldindan qo'lda
      // o'zgartirilsa darvoza `count === 0` ko'rib, kreditni BAND holatda
      // qoldirardi (`lib/credits/ledger.ts` kontrakti).
      await release(doc.userId, doc.creditsHeldFor, doc.id, `stale:${String(STALE_MINUTES)}m`);
      reaped += 1;
    } catch (error) {
      // Bitta hujjat yiqilsa qolganlari tozalanaveradi. Eng ehtimolli
      // sabab — poyga: hujjat shu orada `DONE` bo'lgan va `release`
      // `DocumentNotRunning` tashlagan. Bu normal hol, xato emas.
      failed += 1;
      console.warn(`[reap] ${doc.id} tozalanmadi`, error);
    }
  }

  return { reaped, failed };
}
