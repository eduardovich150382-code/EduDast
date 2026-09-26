import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { costFor } from "./pricing";
import type { LlmErrorKind } from "./errors";
import type { ProviderId, Usage } from "./types";

/**
 * `LlmCall` jadvaliga yozadigan YAGONA joy (CLAUDE.md, 3-qoida).
 *
 * `tests/llm-guard.test.ts` boshqa joyda `prisma.llmCall.create` ni
 * taqiqlaydi. Sabab: xarajat jurnali marjani ko'rishning yagona manbai —
 * u tarqoq yozilsa, ertami-kechmi bitta yo'l unutiladi va hisob noto'g'ri
 * bo'lib qoladi.
 */

export type LlmCallRecord = {
  userId: string | null;
  documentId?: string;
  provider: ProviderId;
  model: string;
  usage: Usage;
  purpose: string;
  /** Urinish yiqilgan bo'lsa — xato turi. Muvaffaqiyatda berilmaydi. */
  errorKind?: LlmErrorKind;
};

/**
 * `$transaction` va CLI skriptlar uchun client parametrik —
 * `lib/curriculum/search.ts` dagi `Db` naqshi.
 */
export type LlmCallDb = Pick<PrismaClient, "llmCall">;

/**
 * Jurnalga yozadi va qator ID'sini qaytaradi.
 *
 * HECH QACHON THROW QILMAYDI. Jurnal yozilmagani yomon, lekin uning
 * sababli tayyor bo'lgan generatsiyani yo'qotish — battar. Xato Sentry'ga
 * ketadi va `null` qaytadi.
 *
 * `db` berilmasa — ilovaning odatdagi client'i. Skriptlar o'zining
 * `createScriptDb()` (`DIRECT_URL`) client'ini uzatadi: `lib/db.ts` modul
 * yuklanishida `DATABASE_URL` bilan pul ochadi, skriptda esa bu ortiqcha
 * ulanish (dotenv'dan oldin yuklansa `undefined` bilan quriladi).
 *
 * DIQQAT: bu yerga `$transaction` ning `tx` sini uzatish — yiqilishi mumkin
 * bo'lgan ishning jurnalini o'sha ish bilan birga rollback qilish. Xato
 * sababi (`errorKind`) aynan shunda kerak bo'ladi, shuning uchun jurnal
 * tranzaksiyadan TASHQARIDA yozilsin.
 */
export async function writeLlmCall(
  rec: LlmCallRecord,
  db: LlmCallDb = prisma,
): Promise<string | null> {
  try {
    const row = await db.llmCall.create({
      data: {
        userId: rec.userId,
        documentId: rec.documentId,
        provider: rec.provider,
        model: rec.model,
        // `tokensIn` — JAMI kirish: keshsiz + keshdan o'qilgan + keshga
        // yozilgan. Jadvalda bitta kirish ustuni bor, taqsimot esa
        // `costUsd` ichida allaqachon hisobga olingan.
        tokensIn: rec.usage.tokensIn + rec.usage.cacheRead + rec.usage.cacheWrite,
        tokensOut: rec.usage.tokensOut,
        costUsd: costFor(rec.model, rec.usage),
        purpose: rec.purpose,
        errorKind: rec.errorKind ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    // Sentry avtomatik ushlaydi (instrumentation.ts). Konsolga ham yozamiz,
    // lekin so'rov mazmunini EMAS — u foydalanuvchi ma'lumoti.
    console.error("[llm] LlmCall yozilmadi", {
      purpose: rec.purpose,
      model: rec.model,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
