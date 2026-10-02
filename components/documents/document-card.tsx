import { StatusBadge } from "@/components/documents/status-badge";
import { Badge } from "@/components/ui/badge";
import type { QualityTone } from "@/lib/documents/quality-tone";
import { Link } from "@/lib/i18n/navigation";

/**
 * Hujjatlar ro'yxatidagi bitta karta.
 *
 * Butun karta — havola (`min-h-11`): telefonda sarlavhaning o'ziga tegish
 * qiyin, kartaning har joyi bosilishi kerak.
 */

export type DocumentCardData = {
  id: string;
  title: string;
  /** Tur yorlig'i — tarjima qilingan ("Dars ishlanma" / "Test"). */
  typeLabel: string;
  /** Mavzu sarlavhasi, o'qituvchi tilida. */
  topicTitle: string;
  /** Formatlangan sana. */
  date: string;
  statusLabel: string;
  statusTone: QualityTone;
  /** Sifat belgisi — faqat tugagan hujjatda, aks holda `null`. */
  quality: { label: string; tone: QualityTone } | null;
};

export function DocumentCard({ doc }: { doc: DocumentCardData }) {
  return (
    <Link
      href={`/ish/hujjat/${doc.id}`}
      className="flex min-h-11 flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink">{doc.title}</span>
        <StatusBadge label={doc.statusLabel} tone={doc.statusTone} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
        <Badge variant="outline">{doc.typeLabel}</Badge>
        <span>{doc.topicTitle}</span>
        <span>{doc.date}</span>
        {doc.quality !== null && (
          <StatusBadge label={doc.quality.label} tone={doc.quality.tone} />
        )}
      </div>
    </Link>
  );
}
