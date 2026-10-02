import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  DocumentCard,
  type DocumentCardData,
} from "@/components/documents/document-card";
import { buttonVariants } from "@/components/ui/button";
import { listQuery, type ListParams } from "@/lib/documents/list-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Hujjatlar ro'yxati: kartalar, bo'sh holatlar va sahifalagich.
 *
 * `hasNext` serverda `take: PER_PAGE + 1` bilan aniqlanadi — `count()`
 * so'rovi QILINMAYDI: "keyingi sahifa bormi" savoliga javob berish uchun
 * butun jadvalni sanash ortiqcha ish.
 */

type Props = {
  params: ListParams;
  docs: DocumentCardData[];
  hasNext: boolean;
  /** Filtr faolmi — bo'sh holat matni shunga qarab tanlanadi. */
  filtered: boolean;
};

export async function DocumentList({ params, docs, hasNext, filtered }: Props) {
  const t = await getTranslations("Documents");

  if (docs.length === 0) {
    // Ikki bo'sh holat ATAYLAB alohida: yangi hisobda birinchisi har kim
    // ko'radigan ekran va u YARATISHGA undashi kerak, ikkinchisi esa
    // filtrni tozalashga.
    return filtered ? (
      <div className="flex flex-col items-start gap-3">
        <p className="w-full rounded-md border border-line px-3 py-8 text-center text-sm text-ink-2">
          {t("emptyFiltered")}
        </p>
        <Link
          href={{ pathname: "/ish/hujjatlar", query: {} }}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          {t("clearFilters")}
        </Link>
      </div>
    ) : (
      <div className="flex flex-col items-start gap-3">
        <p className="w-full rounded-md border border-line px-3 py-8 text-center text-sm text-ink-2">
          {t("empty")}
        </p>
        <Link
          href="/ish/yarat"
          className={buttonVariants({ size: "touch" })}
        >
          {t("create")}
        </Link>
      </div>
    );
  }

  const hasPrev = params.page > 1;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {docs.map((doc) => (
          <li key={doc.id}>
            <DocumentCard doc={doc} />
          </li>
        ))}
      </ul>

      {(hasPrev || hasNext) && (
        <nav className="flex items-center justify-between gap-2">
          {hasPrev ? (
            <Link
              href={{
                pathname: "/ish/hujjatlar",
                // `sahifa` ANIQ berilgani uchun filtr saqlanadi va sahifa
                // 1 ga qaytarilmaydi (`listQuery` dagi izoh).
                query: listQuery(params, { sahifa: params.page - 1 }),
              }}
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              <ChevronLeft className="size-4" strokeWidth={1.5} />
              {t("prev")}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-xs text-ink-2">
            {t("page", { page: params.page })}
          </span>

          {hasNext ? (
            <Link
              href={{
                pathname: "/ish/hujjatlar",
                query: listQuery(params, { sahifa: params.page + 1 }),
              }}
              className={cn(buttonVariants({ variant: "outline", size: "touch" }))}
            >
              {t("next")}
              <ChevronRight className="size-4" strokeWidth={1.5} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
