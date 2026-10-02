import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { DocumentCardData } from "@/components/documents/document-card";
import { DocumentList } from "@/components/documents/document-list";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import {
  listSkip,
  parseListParams,
  PER_PAGE,
  STATUS_PARAM,
  statusParamFor,
} from "@/lib/documents/list-params";
import { qualityTone } from "@/lib/documents/quality-tone";
import { typeParamFor, TYPE_PARAM } from "@/lib/documents/type-param";
import { prisma } from "@/lib/db";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { topicTitle } from "@/lib/topic-title";

/**
 * Hujjatlarim — sahifalangan ro'yxat, tur/holat/qidiruv filtri.
 *
 * Hujjatning 3-bandi. Holat URL'da (`?sahifa=&tur=&holat=&q=`), filtr esa
 * oddiy `<form method="get">` — JavaScript'siz ishlaydi va havola
 * ulashiladi. Shu sababdan `tabs` primitivi QO'SHILMADI: u klient holati
 * bo'lib, URL bilan ikkinchi hokimiyat yasardi.
 */

export default async function HujjatlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Documents");
  const params = parseListParams(await searchParams);

  const rows = await prisma.document.findMany({
    where: {
      userId: user.id,
      // Soft delete qoidasi — o'chirilgan hujjat ro'yxatda ko'rinmaydi.
      deletedAt: null,
      ...(params.type === null ? {} : { type: params.type }),
      ...(params.status === null ? {} : { status: params.status }),
      // Qidiruv faqat SARLAVHA bo'yicha, mavzu nomlari bo'yicha emas:
      // bitta so'rov yetadi, va sarlavha allaqachon o'qituvchining tilida
      // generatsiya qilingan (`boshlaGeneratsiya` uni `topic.titleUz` dan
      // yasaydi).
      ...(params.query === ""
        ? {}
        : { title: { contains: params.query, mode: "insensitive" as const } }),
    },
    // `Document` da `updatedAt` YO'Q. `@@index([userId, createdAt])`
    // allaqachon bor va aynan shu `where` + `orderBy` ga xizmat qiladi —
    // yangi indeks qo'shilmaydi (Neon 0.5GB).
    orderBy: { createdAt: "desc" },
    skip: listSkip(params),
    // +1 qator — "keyingi sahifa bormi" ni `count()` SO'RAMASDAN aniqlash
    // uchun. Ortiqchasi pastda tashlanadi.
    take: PER_PAGE + 1,
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      qualityScore: true,
      createdAt: true,
      topic: { select: { titleUz: true, titleUzCyrl: true, titleRu: true } },
    },
  });

  const hasNext = rows.length > PER_PAGE;
  const page = hasNext ? rows.slice(0, PER_PAGE) : rows;

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });

  const docs: DocumentCardData[] = page.map((row) => {
    const tone = qualityTone(row.status, row.qualityScore);
    return {
      id: row.id,
      title: row.title,
      typeLabel:
        row.type === "LESSON_PLAN" || row.type === "TEST"
          ? t(`type.${row.type}`)
          : row.type,
      topicTitle: topicTitle(row.topic, locale),
      date: dateFormat.format(row.createdAt),
      statusLabel: t(`status.${row.status}`),
      statusTone: tone,
      // Sifat belgisi faqat tugagan hujjatda ma'noli: ball
      // `finishDocument()` da, oxirgi bosqichda yoziladi.
      quality:
        row.status === "DONE" && row.qualityScore !== null
          ? {
              label: tone === "ok" ? t("qualityOk") : t("qualityCheck"),
              tone,
            }
          : null,
    };
  });

  const filtered =
    params.type !== null || params.status !== null || params.query !== "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-ink">
          {t("listTitle")}
        </h1>
        <p className="text-sm text-ink-2">{t("listDescription")}</p>
      </div>

      <form method="get" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("filterType")}
            <select
              name="tur"
              defaultValue={params.type === null ? "" : typeParamFor(params.type)}
              className="h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
            >
              <option value="">{t("filterAll")}</option>
              {Object.entries(TYPE_PARAM).map(([param, type]) => (
                <option key={param} value={param}>
                  {t(`type.${type}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("filterStatus")}
            <select
              name="holat"
              defaultValue={
                params.status === null ? "" : statusParamFor(params.status)
              }
              className="h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
            >
              <option value="">{t("filterAll")}</option>
              {Object.entries(STATUS_PARAM).map(([param, status]) => (
                <option key={param} value={param}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-2">
            {t("search")}
            {/* `components/ui/input.tsx` ni emas, xom `<input>`: primitiv
                `h-8` (32px) va uni admin ham ishlatadi, bu yerda esa 44px
                kerak. */}
            <input
              type="search"
              name="q"
              defaultValue={params.query}
              className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base text-ink placeholder:text-ink-2"
            />
          </label>
          <Button type="submit" variant="outline" size="touch">
            <Search className="size-4" strokeWidth={1.5} />
            {t("searchAction")}
          </Button>
        </div>
      </form>

      <DocumentList
        params={params}
        docs={docs}
        hasNext={hasNext}
        filtered={filtered}
      />
    </div>
  );
}
