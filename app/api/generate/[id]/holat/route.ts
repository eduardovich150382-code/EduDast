import { after, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { DocumentContent } from "@/lib/documents/blocks";
import { prisma } from "@/lib/db";
import { reapStaleDocuments } from "@/lib/generation/reap";

/**
 * Generatsiya holati + tayyor bloklar.
 *
 * Mijoz (`components/generation/stage-runner.tsx`) shu marshrutdan kursorni
 * oladi: brauzer yopilib qayta ochilganda ham konveyer o'sha joydan davom
 * etadi, chunki progress xotirada emas, BAZADA.
 *
 * `after()` ichida yetim hujjatlar tozalanadi — javob kechikmaydi, lekin
 * 15 daqiqalik va'da aynan shu yerda bajariladi (`lib/generation/reap.ts`).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ProgressSchema = z.object({
  stage: z.number().int().min(0),
  total: z.number().int().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await auth();
  if (!user) {
    return NextResponse.json({ ok: false, error: "kirilmagan" }, { status: 401 });
  }

  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: {
      status: true,
      contentJson: true,
      inputParams: true,
      failReason: true,
      qualityScore: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ ok: false, error: "topilmadi" }, { status: 404 });
  }

  // Tozalash javobdan KEYIN: o'qish yo'li tez bo'lishi kerak.
  after(async () => {
    await reapStaleDocuments(user.id);
  });

  // Kontent buzuq bo'lsa ham holat qaytsin: mijoz hech bo'lmasa statusni
  // ko'rsin va foydalanuvchi "yuklanmoqda" da osilib qolmasin.
  const parsedContent = DocumentContent.safeParse(doc.contentJson);
  const progress = ProgressSchema.safeParse(
    (doc.inputParams as { progress?: unknown } | null)?.progress,
  );

  return NextResponse.json({
    ok: true,
    status: doc.status,
    stage: progress.success ? progress.data.stage : 0,
    total: progress.success ? progress.data.total : 3,
    blocks: parsedContent.success ? parsedContent.data.blocks : [],
    failReason: doc.failReason,
    qualityScore: doc.qualityScore,
  });
}
