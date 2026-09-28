import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { DocumentBlocks } from "@/components/generation/document-blocks";
import { StageRunner } from "@/components/generation/stage-runner";
import { auth } from "@/lib/auth";
import { DocumentContent } from "@/lib/documents/blocks";
import { prisma } from "@/lib/db";
import { reapStaleDocuments } from "@/lib/generation/reap";
import { SCORE_WARN } from "@/lib/generation/quality";

/**
 * Hujjat ko'ruvchi — TAHRIRSIZ (13-sessiya).
 *
 * `RUNNING` bo'lsa tayyor bloklar ko'rsatiladi va `StageRunner` qolgan
 * bosqichlarni haydaydi. Progress bazada, shuning uchun brauzerni yopib
 * qayta ochish konveyerni buzmaydi — sahifa o'sha joydan davom etadi.
 */

export default async function HujjatPage({ params }: { params: Promise<{ id: string }> }) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const t = await getTranslations("Documents");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: {
      title: true,
      status: true,
      contentJson: true,
      inputParams: true,
      failReason: true,
      qualityScore: true,
    },
  });

  if (!doc) notFound();

  // Yetim hujjatlarni tozalash — javobdan KEYIN, sahifa kechikmasin.
  // 15 daqiqalik va'dani aynan shu yo'l bajaradi (`lib/generation/reap.ts`).
  after(async () => {
    await reapStaleDocuments(user.id);
  });

  // Kontent buzuq bo'lsa ham sahifa ochilsin: foydalanuvchi hech
  // bo'lmasa statusni va sababni ko'rsin.
  const parsed = DocumentContent.safeParse(doc.contentJson);
  const blocks = parsed.success ? parsed.data.blocks : [];
  const progress = readProgress(doc.inputParams);

  const running = doc.status === "QUEUED" || doc.status === "RUNNING";
  const lowQuality =
    doc.status === "DONE" && doc.qualityScore !== null && doc.qualityScore < SCORE_WARN;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold text-ink">{doc.title}</h1>
        <span className="text-xs text-ink-2">{t(`status.${doc.status}`)}</span>
      </div>

      {running && (
        <StageRunner documentId={id} stage={progress.stage} total={progress.total} />
      )}

      {doc.status === "FAILED" && (
        <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
          {doc.failReason === null ? t("status.FAILED") : t("failReason", { reason: doc.failReason })}
        </p>
      )}

      {lowQuality && (
        <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
          {t("qualityWarning")}
        </p>
      )}

      {blocks.length > 0 && <DocumentBlocks blocks={blocks} />}

      {running && (
        <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-ink-2">
          {t("pending")}
        </p>
      )}
    </div>
  );
}

/** `inputParams.progress` — buzuq bo'lsa boshidan boshlanadi. */
function readProgress(inputParams: unknown): { stage: number; total: number } {
  const progress = (inputParams as { progress?: unknown } | null)?.progress;
  if (typeof progress !== "object" || progress === null) return { stage: 0, total: 3 };
  const record = progress as { stage?: unknown; total?: unknown };
  return {
    stage: typeof record.stage === "number" ? record.stage : 0,
    total: typeof record.total === "number" ? record.total : 3,
  };
}
