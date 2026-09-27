"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { boshlaGeneratsiya, type GenerationError } from "@/server/generation-actions";

/**
 * Dars ishlanma yaratish formasi.
 *
 * Fan/sinf/chorak tanlovi SAHIFADA, `?fan=&sinf=&chorak=` bilan
 * (`app/[locale]/ish/rejam/page.tsx` naqshi — JavaScript'siz ishlaydi va
 * havolani ulashish mumkin). Bu komponent faqat oxirgi ikki maydonni va
 * yuborishni oladi, chunki ular action chaqiradi.
 *
 * To'liq sehrgar — 11-sessiya.
 */

type Props = {
  topics: { id: string; title: string }[];
  /** Tanlangan mavzu (`?mavzu=`), bo'lmasa birinchisi. */
  selectedTopicId: string | null;
  durations: number[];
  defaultDuration: number;
  cost: number;
};

export function CreateForm({
  topics,
  selectedTopicId,
  durations,
  defaultDuration,
  cost,
}: Props) {
  const t = useTranslations("Generator");
  const router = useRouter();

  const [topicId, setTopicId] = useState(selectedTopicId ?? topics[0]?.id ?? "");
  const [duration, setDuration] = useState(defaultDuration);
  const [error, setError] = useState<GenerationError | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await boshlaGeneratsiya({ topicId, durationMinutes: duration });
      if (result.ok) {
        router.push(`/ish/hujjat/${result.documentId}`);
        return;
      }
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        {t("topic")}
        <select
          value={topicId}
          onChange={(event) => {
            setTopicId(event.target.value);
          }}
          className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-ink-2">
        {t("duration")}
        <select
          value={String(duration)}
          onChange={(event) => {
            setDuration(Number(event.target.value));
          }}
          className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
        >
          {durations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t("durationLabel", { minutes })}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-ink-2">{t("cost", { count: cost })}</p>

      {error !== null && (
        <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">{t(`errors.${error}`)}</p>
      )}

      <Button type="button" onClick={handleSubmit} disabled={pending || topicId === ""}>
        <Sparkles className="size-4" strokeWidth={1.5} />
        {t("submit")}
      </Button>
    </div>
  );
}
