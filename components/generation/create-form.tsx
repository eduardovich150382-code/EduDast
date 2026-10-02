"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { boshlaGeneratsiya, type GenerationError } from "@/server/generation-actions";

/**
 * Hujjat yaratish formasi.
 *
 * Fan/sinf/chorak va HUJJAT TURI tanlovi SAHIFADA, `?fan=&sinf=&chorak=&tur=`
 * bilan (`app/[locale]/ish/rejam/page.tsx` naqshi — JavaScript'siz ishlaydi
 * va havolani ulashish mumkin). Bu komponent faqat action chaqiradigan
 * maydonlarni oladi.
 *
 * To'liq sehrgar — 11-sessiya.
 */

/** Savol soni varianti — narxi SERVERDA hisoblangan. */
type QuestionOption = { value: number; cost: number };

const QUESTION_KINDS = ["mcq", "short", "truefalse", "match"] as const;
const DIFFICULTIES = ["easy", "mixed", "hard"] as const;

/** Standart tanlov: eng ko'p ishlatiladigan uch tur. */
const DEFAULT_KINDS: readonly string[] = ["mcq", "short", "truefalse"];

type Props = {
  kind: "LESSON_PLAN" | "TEST";
  topics: { id: string; title: string }[];
  /** Tanlangan mavzu (`?mavzu=`), bo'lmasa birinchisi. */
  selectedTopicId: string | null;
  durations: number[];
  defaultDuration: number;
  cost: number;
  questionOptions: QuestionOption[];
  defaultQuestionCount: number;
};

export function CreateForm({
  kind,
  topics,
  selectedTopicId,
  durations,
  defaultDuration,
  cost,
  questionOptions,
  defaultQuestionCount,
}: Props) {
  const t = useTranslations("Generator");
  const router = useRouter();

  const [topicId, setTopicId] = useState(selectedTopicId ?? topics[0]?.id ?? "");
  const [duration, setDuration] = useState(defaultDuration);
  const [questionCount, setQuestionCount] = useState(defaultQuestionCount);
  const [kinds, setKinds] = useState<string[]>([...DEFAULT_KINDS]);
  const [difficulty, setDifficulty] = useState<string>("mixed");
  const [error, setError] = useState<GenerationError | null>(null);
  const [pending, startTransition] = useTransition();

  const isTest = kind === "TEST";
  // Ko'rsatiladigan narx serverdan kelgan ro'yxatdan O'QILADI, qayta
  // hisoblanmaydi (`page.tsx` dagi izoh).
  const shownCost = isTest
    ? (questionOptions.find((option) => option.value === questionCount)?.cost ?? cost)
    : cost;

  function toggleKind(value: string) {
    setKinds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function handleSubmit() {
    setError(null);
    // Bo'sh tur ro'yxati action'da ham rad etiladi (Zod `min(1)`), lekin
    // o'qituvchiga sababni DARHOL ko'rsatamiz — kredit band qilinmaydi.
    if (isTest && kinds.length === 0) {
      setError("invalid");
      return;
    }

    startTransition(async () => {
      const result = await boshlaGeneratsiya(
        isTest
          ? { type: "TEST", topicId, questionCount, kinds, difficulty }
          : { type: "LESSON_PLAN", topicId, durationMinutes: duration },
      );
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

      {isTest ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("questionCount")}
            <select
              value={String(questionCount)}
              onChange={(event) => {
                setQuestionCount(Number(event.target.value));
              }}
              className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
            >
              {questionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t("questionCountLabel", { count: option.value })}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs text-ink-2">{t("kindsLabel")}</legend>
            <div className="flex flex-wrap gap-3">
              {QUESTION_KINDS.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={kinds.includes(item)}
                    onChange={() => {
                      toggleKind(item);
                    }}
                    className="size-4 rounded border-line"
                  />
                  {t(`kind.${item}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("difficultyLabel")}
            <select
              value={difficulty}
              onChange={(event) => {
                setDifficulty(event.target.value);
              }}
              className="h-10 rounded-lg border border-line bg-paper px-2 text-sm text-ink"
            >
              {DIFFICULTIES.map((item) => (
                <option key={item} value={item}>
                  {t(`difficulty.${item}`)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
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
      )}

      <p className="text-sm text-ink-2">{t("cost", { count: shownCost })}</p>

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
