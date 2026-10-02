import { Badge } from "@/components/ui/badge";
import type { QualityTone } from "@/lib/documents/quality-tone";
import { cn } from "@/lib/utils";

/**
 * Hujjat holati / sifati belgisi.
 *
 * `label` TARJIMA QILINGAN holda keladi — komponent server component, lekin
 * uni chaqiradigan joy allaqachon kerakli nomfazada turadi, va bitta
 * komponent ikki xil matnni (holat va sifat) ko'rsatgani uchun kalitni
 * ichida tanlash chalkashlik bo'lardi.
 *
 * Ranglar `components/ui/badge.tsx` variantlariga QO'SHILMADI: u shadcn
 * registry chiqishi holatida qolsin (keyingi `shadcn add` bilan ziddiyat
 * bo'lmasin). Shuning uchun token utilitalari shu yerda — ikkisi ham
 * `app/globals.css` dagi `@theme inline` orqali `styles/tokens.css` dan
 * keladi, ya'ni CLAUDE.md 2-qoidasi buzilmaydi.
 */

const TONE_CLASS: Record<QualityTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-accent-2/10 text-accent-2",
  warn: "bg-warn/10 text-warn",
  fail: "bg-destructive/10 text-destructive",
};

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: QualityTone;
}) {
  return (
    <Badge variant="muted" className={cn(TONE_CLASS[tone])}>
      {label}
    </Badge>
  );
}
