"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentContent } from "@/lib/documents/blocks";
import { MAX_PAYLOAD_CHARS } from "@/lib/documents/lifecycle";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Hujjat action'lari (docs/sessions/13-muharrir.md, 4-band).
 *
 * Tartib: `"use server"` -> `requireAuth()` -> Zod -> `where` ichida egalik ->
 * yozish -> `revalidatePath`. Auth BIRINCHI await (CLAUDE.md 6-qoida):
 * layout server action POST'ini himoya qilmaydi, shuning uchun har action
 * o'zini o'zi qo'riqlaydi.
 *
 * NEGA `requireAuth`, `requireOnboarded` EMAS: bu action'lar
 * `user.subjects` / `user.grades` / `region` ni o'qimaydi, faqat `user.id` ni
 * `where` ga qo'yadi (`server/settings-actions.ts` dagi tanlov qoidasi).
 *
 * EGALIK `where` ICHIDA, oldindan `findFirst` BILAN EMAS: tekshiruv va yozuv
 * orasida poyga qolmasin. `count === 0` esa ATAYLAB `"topilmadi"` —
 * `"ruxsat"` bo'lsa chaqiruvchi begona id mavjudligini tekshirib ko'ra olardi
 * (`server/class-actions.ts` naqshi).
 */

export type DocumentActionError = "invalid" | "topilmadi";
export type DocumentActionResult = { ok: true } | { ok: false; error: DocumentActionError };

const DOCUMENT_PATHS = [
  "/[locale]/ish",
  "/[locale]/ish/hujjatlar",
  "/[locale]/ish/hujjat/[id]",
];

function revalidateDocuments(): void {
  for (const path of DOCUMENT_PATHS) revalidatePath(path, "page");
}

const idSchema = z.object({ id: z.string().min(1).max(64) });

const saveSchema = z.object({
  id: z.string().min(1).max(64),
  /**
   * BUTUN kontent, patch EMAS. `contentJson` jsonb bo'lgani uchun qismli
   * yozuv bu yerda `jsonb ||` ni talab qilardi, muharrir esa blok
   * o'chirishni va tartib almashtirishni ham qiladi — ularni birlashtirish
   * bilan ifodalab bo'lmaydi.
   */
  content: DocumentContent,
});

const renameSchema = z.object({
  id: z.string().min(1).max(64),
  /** `Document.title` — `String`, uzunlik chegarasi shu yerda. */
  title: z.string().trim().min(1).max(200),
});

/**
 * Muharrirdan kelgan kontentni saqlaydi.
 *
 * STATUS DARVOZASI `where` ICHIDA: `QUEUED`/`RUNNING` hujjat chetlanadi.
 * Sabab — `lib/documents/lifecycle.ts:commitStage` bloklarni `jsonb ||` bilan
 * QO'SHIB boradi, bu yerdagi yozuv esa butun ustunni ALMASHTIRADI. Ikkisi
 * bir vaqtda ketsa generatsiya natijasi jimgina yo'qolardi.
 *
 * `FAILED` esa ATAYLAB kiritilgan: yarim bitgan hujjatda ham foydali matn
 * bor va o'qituvchi uni qo'lda tugatishi mumkin bo'lishi kerak.
 *
 * Alohida xato kodi KERAK EMAS: `/tahrir` marshruti tugamagan hujjatni
 * allaqachon ko'ruvchiga qaytaradi, bu ikkinchi qavat.
 */
export async function saveDocument(input: unknown): Promise<DocumentActionResult> {
  const user = await requireAuth();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // Hajm shifti konveyerdagi bilan AYNI (`MAX_PAYLOAD_CHARS`): muharrir
  // konveyer sig'dirgan hujjatni qaytara olmaydigan holat chiqmasin.
  if (JSON.stringify(parsed.data.content.blocks).length > MAX_PAYLOAD_CHARS) {
    return { ok: false, error: "invalid" };
  }

  const saved = await prisma.document.updateMany({
    where: {
      id: parsed.data.id,
      userId: user.id,
      deletedAt: null,
      status: { in: ["DONE", "FAILED"] },
    },
    data: {
      contentJson: parsed.data.content,
      // SIFAT BALLI TOZALANADI. U generatsiya paytidagi matn uchun
      // hisoblangan (`lib/generation/quality.ts`); tahrirdan keyin ro'yxat
      // kartasida "sifat yaxshi" turardi, lekin u endi boshqa matnni
      // tavsiflardi. `qualityTone()` `DONE` + `null` ni "neutral" qiladi,
      // ya'ni belgi shunchaki yo'qoladi — yolg'on belgidan ko'ra
      // belgisizlik yaxshi. `qualityNotes` birga ketadi: ball ostidagi
      // izohni qoldirish o'sha yolg'onning bir qavat pastdagi nusxasi.
      qualityScore: null,
      // `Json?` ustunda `null` TS darajasida rad etiladi: Prisma uchun
      // "SQL NULL" (`DbNull`) va "JSON null" (`JsonNull`) ikki xil narsa.
      // Bizga ustunning o'zi bo'sh bo'lishi kerak, ya'ni `DbNull`.
      qualityNotes: Prisma.DbNull,
    },
  });
  if (saved.count === 0) return { ok: false, error: "topilmadi" };

  revalidateDocuments();
  return { ok: true };
}

/** Hujjat sarlavhasini o'zgartiradi. Generatsiya paytida ham zararsiz. */
export async function renameDocument(input: unknown): Promise<DocumentActionResult> {
  const user = await requireAuth();
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const renamed = await prisma.document.updateMany({
    where: { id: parsed.data.id, userId: user.id, deletedAt: null },
    data: { title: parsed.data.title },
  });
  if (renamed.count === 0) return { ok: false, error: "topilmadi" };

  revalidateDocuments();
  return { ok: true };
}

/**
 * Soft delete (CLAUDE.md baza qoidasi: hech qachon `delete`).
 *
 * Generatsiya ketayotgan hujjatni ham o'chirish mumkin: `lifecycle.ts` dagi
 * xom SQL larning HAMMASIDA `AND "deletedAt" IS NULL` bor, demak konveyer
 * o'chirilgan hujjatni o'zi tashlab ketadi va kredit `release` orqali
 * qaytadi.
 */
export async function deleteDocument(input: unknown): Promise<DocumentActionResult> {
  const user = await requireAuth();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const deleted = await prisma.document.updateMany({
    where: { id: parsed.data.id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (deleted.count === 0) return { ok: false, error: "topilmadi" };

  revalidateDocuments();
  return { ok: true };
}
