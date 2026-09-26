"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { isCreditError } from "@/lib/credits/errors";
import { grant } from "@/lib/credits/ledger";

/**
 * Kredit action'lari (docs/sessions/06 — kreditlar).
 *
 * Tartib: `"use server"` -> `requireAdmin()` -> Zod -> yozish ->
 * `revalidatePath`. Auth validatsiyadan OLDIN (CLAUDE.md 6-qoida) — kirmagan
 * chaqiruvchi sxema haqida hech narsa bilmasligi kerak.
 *
 * DIQQAT: `app/[locale]/admin/layout.tsx` dagi qorovul bu action'ni HIMOYA
 * QILMAYDI — server action POST'i layout'dan o'tmaydi, uni to'g'ridan-to'g'ri
 * chaqirish mumkin. Shuning uchun `requireAdmin()` shu yerda, birinchi await
 * qilinadigan operator sifatida turadi (`server/admin-actions.ts` bilan bir
 * xil sabab).
 *
 * Admin paneli faqat o'zbek tilida (CLAUDE.md 1-qoidaga istisno), shuning
 * uchun xato kodlari ham shu yerda qisqa satr.
 */

export type CreditResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; error: "invalid" | "topilmadi" | "xato" };

/**
 * `/ish` sahifalari cookie o'qigani uchun dinamik — ularga kesh
 * invalidatsiyasi kerak emas. Bu yerda faqat admin jadvallari yangilanadi.
 */
const CREDIT_PATHS = ["/[locale]/admin", "/[locale]/admin/foydalanuvchilar"];

function revalidateCredits(): void {
  for (const path of CREDIT_PATHS) revalidatePath(path, "page");
}

const grantSchema = z.object({
  userId: z.string().min(1).max(64),
  // Yuqori chegara — qo'l xatosi qorovuli: 50 o'rniga 500 yozib yuborish
  // real pul. Daftar qatlamida yana bir cheklov bor (`MAX_AMOUNT`).
  amount: z.number().int().min(1).max(1000),
});

/**
 * Admin o'qituvchiga kredit beradi.
 *
 * Balansni oshirish va `CreditTx` yozish — `lib/credits/ledger.ts:grant`
 * ichida, bitta tranzaksiyada. Bu yerda faqat qorovul, validatsiya va
 * xatoni qisqa kodga aylantirish.
 */
export async function grantCredits(input: unknown): Promise<CreditResult> {
  const admin = await requireAdmin();
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    // `refId` — KIM berdi. Grant real pul qiymati, shuning uchun daftarda
    // bergan adminning izi qolishi shart.
    const balanceAfter = await grant(parsed.data.userId, parsed.data.amount, `admin:${admin.id}`);
    revalidateCredits();
    return { ok: true, balanceAfter };
  } catch (e) {
    // Kutilgan domen xatosi qisqa kodga aylanadi. Boshqasi (baza uzildi,
    // tarmoq) ATAYLAB yuqoriga tashlanadi: uni "xato" deb yutish nosozlikni
    // jimgina yashirardi.
    if (isCreditError(e)) {
      return { ok: false, error: e.kind === "user_not_found" ? "topilmadi" : "xato" };
    }
    throw e;
  }
}
