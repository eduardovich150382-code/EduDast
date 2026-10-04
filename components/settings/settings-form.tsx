"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { saveLocale, saveReminderPrefs } from "@/server/settings-actions";

/**
 * Eslatma o'girgichlari va til tanlovi.
 *
 * YANGI PAKET QO'SHILMADI: `Switch` primitivi repoda yo'q, shuning uchun
 * `components/admin/subject-active-toggle.tsx` naqshi — variant va
 * ikonkasi almashadigan `Button`. Optimistik EMAS: server javobidan
 * keyin holat o'zgaradi, chunki noto'g'ri ko'rsatilgan holat ("eslatma
 * yoqilgan" deb turib aslida o'chirilgan) aynan shu ekranda eng
 * chalg'ituvchi.
 *
 * Matnlar `labels` obyektida — `t()` RSC chegarasidan o'tmaydi va
 * funksiya prop uzatish `tests/client-props-guard.test.ts` bilan
 * taqiqlangan.
 */

export type SettingsLabels = {
  reminders: { title: string; description: string };
  digest: { title: string; description: string };
  on: string;
  off: string;
  language: string;
  saved: string;
  errors: { invalid: string; generic: string };
  localeNames: Record<string, string>;
};

export function SettingsForm({
  remindersEnabled,
  weeklyDigestEnabled,
  locale,
  locales,
  labels,
}: {
  remindersEnabled: boolean;
  weeklyDigestEnabled: boolean;
  locale: string;
  locales: readonly string[];
  labels: SettingsLabels;
}) {
  const [reminders, setReminders] = useState(remindersEnabled);
  const [digest, setDigest] = useState(weeklyDigestEnabled);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  function savePrefs(next: { reminders: boolean; digest: boolean }) {
    setStatus("idle");
    startTransition(async () => {
      const result = await saveReminderPrefs({
        remindersEnabled: next.reminders,
        weeklyDigestEnabled: next.digest,
      });
      if (!result.ok) {
        setStatus("error");
        return;
      }
      setReminders(next.reminders);
      setDigest(next.digest);
      setStatus("saved");
    });
  }

  function changeLocale(nextLocale: string | null) {
    if (!nextLocale || nextLocale === locale) return;
    setStatus("idle");
    startTransition(async () => {
      // BAZAGA ham yoziladi: bot xabarlari `User.locale` bo'yicha
      // render qilinadi, URL almashishi esa unga tegmaydi.
      const result = await saveLocale({ locale: nextLocale });
      if (!result.ok) {
        setStatus("error");
        return;
      }
      router.replace(
        // @ts-expect-error -- pathname kelib chiqishi dinamik, next-intl turlari buni to'liq kuzata olmaydi
        { pathname, params },
        { locale: nextLocale },
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Row
        title={labels.reminders.title}
        description={labels.reminders.description}
        enabled={reminders}
        pending={pending}
        onLabel={labels.on}
        offLabel={labels.off}
        onToggle={() => savePrefs({ reminders: !reminders, digest })}
      />

      {/*
        Xulosa o'girgichi eslatma o'chirilganda bloklanadi: server
        tomonda ham umumiy o'girgich ustun turadi
        (`lib/reminders/plan.ts` 1-darvoza), ya'ni yoqilgan ko'rinishi
        yolg'on bo'lardi.
      */}
      <Row
        title={labels.digest.title}
        description={labels.digest.description}
        enabled={digest}
        pending={pending || !reminders}
        onLabel={labels.on}
        offLabel={labels.off}
        onToggle={() => savePrefs({ reminders, digest: !digest })}
      />

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-3">
        <p className="text-sm font-medium text-ink">{labels.language}</p>
        <Select value={locale} onValueChange={changeLocale}>
          <SelectTrigger aria-label={labels.language} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {labels.localeNames[loc] ?? loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === "saved" && <p className="text-xs text-ink-2">{labels.saved}</p>}
      {status === "error" && <p className="text-xs text-warn">{labels.errors.generic}</p>}
    </div>
  );
}

function Row({
  title,
  description,
  enabled,
  pending,
  onLabel,
  offLabel,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  pending: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-2">{description}</p>
      </div>
      <Button
        variant={enabled ? "secondary" : "outline"}
        size="touch"
        disabled={pending}
        aria-pressed={enabled}
        onClick={onToggle}
      >
        {enabled ? (
          <>
            <Bell className="size-4" strokeWidth={1.5} />
            {onLabel}
          </>
        ) : (
          <>
            <BellOff className="size-4" strokeWidth={1.5} />
            {offLabel}
          </>
        )}
      </Button>
    </div>
  );
}
