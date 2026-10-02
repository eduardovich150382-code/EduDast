import { AlertTriangle, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { DocumentBlocks } from "@/components/generation/document-blocks";
import { GenerationProgress } from "@/components/generation/generation-progress";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { DocumentContent } from "@/lib/documents/blocks";
import type { SupportedDocumentType } from "@/lib/documents/type-param";
import { prisma } from "@/lib/db";
import { reapStaleDocuments } from "@/lib/generation/reap";
import { SCORE_WARN } from "@/lib/generation/quality";
import {
  stageLabelInputFromDocument,
  stageLabels,
  stageRows,
} from "@/lib/generation/stage-labels";
import { wizardQueryFromDocument } from "@/lib/generation/wizard-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Hujjat ko'ruvchi — TAHRIRSIZ (13-sessiya).
 *
 * `RUNNING` bo'lsa tayyor bloklar ko'rsatiladi va `GenerationProgress`
 * qolgan bosqichlarni haydaydi. Progress bazada, shuning uchun brauzerni
 * yopib qayta ochish konveyerni buzmaydi — sahifa o'sha joydan davom etadi.
 */

export default async function HujjatPage({ params }: { params: Promise<{ id: string }> }) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const t = await getTranslations("Documents");
  const tg = await getTranslations("Generator");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: {
      title: true,
      type: true,
      topicId: true,
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

  // Konveyer faqat ikki tur uchun bor (`lib/generation/run-stage.ts`
  // qolganlarini ataylab yiqitadi), shuning uchun turni shu ikkisiga
  // qisamiz — aks holda bosqich nomlari va qayta urinish havolasi
  // mavjud bo'lmagan reja uchun qurilardi.
  const supportedType: SupportedDocumentType | null =
    doc.type === "TEST" ? "TEST" : doc.type === "LESSON_PLAN" ? "LESSON_PLAN" : null;

  const stageNames =
    supportedType === null
      ? []
      : buildStageNames({
          type: supportedType,
          inputParams: doc.inputParams,
          total: progress.total,
          tg,
        });

  // Qo'llab-quvvatlanmagan turda BO'SH query — havola sehrgarni toza holda
  // ochadi. `null` qilib qo'yish progressni butunlay yashirardi va hujjat
  // `QUEUED` da osilib qolardi.
  const retryQuery =
    supportedType === null
      ? {}
      : wizardQueryFromDocument({
          type: supportedType,
          topicId: doc.topicId,
          inputParams: doc.inputParams,
        });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold text-ink">{doc.title}</h1>
        <span className="text-xs text-ink-2">{t(`status.${doc.status}`)}</span>
      </div>

      {running && (
        <GenerationProgress
          documentId={id}
          stage={progress.stage}
          total={progress.total}
          stageNames={stageNames}
          retryQuery={retryQuery}
        />
      )}

      {doc.status === "FAILED" && (
        <div className="flex flex-col gap-3 rounded-md bg-warn/10 px-3 py-3">
          <p className="flex items-start gap-2 text-sm text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
            {doc.failReason === null
              ? t("status.FAILED")
              : t("failReason", { reason: doc.failReason })}
          </p>

          {/* Qayta urinish JavaScript'SIZ ishlaydi: oddiy havola, sehrgarni
              to'ldirilgan holda ochadi. Yangi server action yo'q — kredit
              allaqachon qaytarilgan, demak hujjatni qayta navbatga qo'yish
              oddiy yaratish oqimining aynan o'zini qilardi va ikkinchi
              kredit-hold yo'lini yasardi. */}
          <Link
            href={{ pathname: "/ish/yarat", query: retryQuery }}
            className={cn(
              buttonVariants({ variant: "outline", size: "touch" }),
              "self-start",
            )}
          >
            <RefreshCw className="size-4" strokeWidth={1.5} />
            {tg("retry")}
          </Link>
        </div>
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

/**
 * Ko'rinadigan bosqich nomlari.
 *
 * Reja `inputParams` dan QAYTA QURILADI: `TEST` uchun `questionCount`,
 * `LESSON_PLAN` uchun 1-bosqich yozib qoldirgan `skeleton`. Shuning uchun
 * dars ishlanmada ro'yxat 1-bosqichdan keyin 3 dan 4 ga o'sadi va buni
 * mavjud `router.refresh()` o'zi hal qiladi — qo'shimcha so'rov yo'q.
 *
 * Nomlar BEZAK, haqiqat manbai `progress.total`: reja bilan son mos kelmasa
 * (buzuq `inputParams`) bo'sh ro'yxat qaytadi va komponent nomsiz, lekin
 * to'g'ri sondagi qatorlarni ko'rsatadi.
 */
function buildStageNames({
  type,
  inputParams,
  total,
  // Nomi ATAYLAB `tg`, `t` emas: `tests/i18n-usage.test.ts` nomfazani
  // o'zgaruvchi nomi bo'yicha MATN darajasida bog'laydi. `t` deb nomlansa
  // skaner uni shu fayldagi `getTranslations("Documents")` bog'lamiga
  // qo'shib, `Generator.stages` ni `Documents.stages` deb tekshirardi
  // (va `Documents.stages` satr, obyekt emas — test yiqilardi).
  tg,
}: {
  type: SupportedDocumentType;
  inputParams: unknown;
  total: number;
  tg: Awaited<ReturnType<typeof getTranslations<"Generator">>>;
}): string[] {
  const input = stageLabelInputFromDocument(type, inputParams);
  if (input === null) return [];

  const rows = stageRows(stageLabels(input));
  if (rows.length !== total) return [];

  return rows.map((row) => {
    const label = tg(`stages.${input.type}.${row.kind}`);
    return row.part === undefined
      ? label
      : tg("stagePart", { label, index: row.part.index, count: row.part.count });
  });
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
