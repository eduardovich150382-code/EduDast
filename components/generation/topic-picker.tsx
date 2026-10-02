import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  wizardQuery,
  type WizardParams,
} from "@/lib/generation/wizard-params";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Mavzu pikeri — daraxt ko'rinishi yoki qidiruv natijasi.
 *
 * SERVER COMPONENT, KLIENT HOLATI YO'Q. Daraxt native `<details>` /
 * `<summary>` bilan ochiladi-yopiladi, ya'ni `useState` ham, klient
 * chegarasi ham kerak emas va piker JavaScript'siz ishlaydi.
 *
 * Qidiruv natijasi RELEVANTLIK tartibida keladi (daraxt tartibida emas),
 * shuning uchun u tekis ro'yxat — soxta ierarxiya ko'rsatish natijani
 * noto'g'ri o'qishga majburlardi.
 */

export type PickerTopic = {
  id: string;
  title: string;
};

export type PickerNode = PickerTopic & { children: PickerTopic[] };

type Props = {
  params: WizardParams;
  /** Daraxt (qidiruv bo'sh bo'lganda). */
  tree: PickerNode[];
  /** Qidiruv natijasi — `null` bo'lsa daraxt ko'rsatiladi. */
  results: PickerTopic[] | null;
};

export async function TopicPicker({ params, tree, results }: Props) {
  const t = await getTranslations("Generator");

  if (results !== null) {
    if (results.length === 0) {
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="w-full rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
            {t("noSearchResults")}
          </p>
          <Link
            href={{
              pathname: "/ish/yarat",
              query: wizardQuery(params, { q: null }),
            }}
            className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
          >
            {t("clearSearch")}
          </Link>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {results.map((topic) => (
            <li key={topic.id}>
              <TopicLink params={params} topic={topic} />
            </li>
          ))}
        </ul>
        <Link
          href={{
            pathname: "/ish/yarat",
            query: wizardQuery(params, { q: null }),
          }}
          className="inline-flex min-h-11 items-center self-start text-sm text-accent underline-offset-4 hover:underline"
        >
          {t("clearSearch")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {tree.map((node) =>
        node.children.length === 0 ? (
          // Bolasi yo'q ildiz — bo'sh ochiladigan blok emas, to'g'ridan-to'g'ri
          // havola. Aks holda o'qituvchi bosib, ichi bo'sh ekanini ko'rardi.
          <li key={node.id}>
            <TopicLink params={params} topic={node} />
          </li>
        ) : (
          <li key={node.id}>
            <details
              open
              className="rounded-xl border border-line bg-surface px-3 py-2"
            >
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink">
                {node.title}
              </summary>
              <ul className="mt-1 flex flex-col gap-1 border-t border-line pt-1">
                {node.children.map((child) => (
                  <li key={child.id}>
                    <TopicLink params={params} topic={child} nested />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ),
      )}
    </ul>
  );
}

function TopicLink({
  params,
  topic,
  nested = false,
}: {
  params: WizardParams;
  topic: PickerTopic;
  nested?: boolean;
}) {
  const selected = params.topicId === topic.id;

  return (
    <Link
      href={{
        pathname: "/ish/yarat",
        // Mavzu tanlangach darhol parametr qadamiga o'tiladi — tanlovni
        // ikki marta tasdiqlashga majburlash keraksiz qadam bo'lardi.
        query: wizardQuery(params, { mavzu: topic.id, qadam: "param" }),
      }}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        nested ? "" : "border border-line bg-surface",
        selected
          ? "bg-accent/10 text-ink"
          : "text-ink hover:bg-muted",
      )}
    >
      <span>{topic.title}</span>
      <ChevronRight
        className="size-4 shrink-0 text-ink-2"
        strokeWidth={1.5}
        aria-hidden
      />
    </Link>
  );
}
