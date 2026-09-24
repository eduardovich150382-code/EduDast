import { prisma } from "@/lib/db";
import { costFor } from "./pricing";
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
};

/**
 * Jurnalga yozadi va qator ID'sini qaytaradi.
 *
 * HECH QACHON THROW QILMAYDI. Jurnal yozilmagani yomon, lekin uning
 * sababli tayyor bo'lgan generatsiyani yo'qotish — battar. Xato Sentry'ga
 * ketadi va `null` qaytadi.
 */
export async function writeLlmCall(rec: LlmCallRecord): Promise<string | null> {
  try {
    const row = await prisma.llmCall.create({
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
