import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  TopicPicker,
  type PickerNode,
  type PickerTopic,
} from "@/components/generation/topic-picker";
import { Button } from "@/components/ui/button";
import type { WizardParams } from "@/lib/generation/wizard-params";

/**
 * 2-qadam: mavzu.
 *
 * Fan/sinf/chorak/qidiruv — oddiy `<form method="get">`, ya'ni
 * JavaScript'siz ishlaydi (`app/[locale]/ish/rejam/page.tsx` naqshi).
 *
 * `mavzu` formaga YASHIRIN MAYDON sifatida qo'shilmaydi: fan yoki sinf
 * o'zgarsa, oldin tanlangan mavzu boshqa fanga tegishli bo'lib qoladi va
 * uni saqlab qolish o'qituvchiga mos kelmaydigan tanlovni ko'rsatardi.
 */

type Props = {
  params: WizardParams;
  subjects: { slug: string; name: string }[];
  grades: number[];
  selectedSubject: string;
  selectedGrade: number;
  tree: PickerNode[];
  results: PickerTopic[] | null;
  /** Fan+sinf bo'yicha umuman mavzu yo'q. */
  emptyMessage: string | null;
};

const QUARTERS = [1, 2, 3, 4];

export async function StepTopic({
  params,
  subjects,
  grades,
  selectedSubject,
  selectedGrade,
  tree,
  results,
  emptyMessage,
}: Props) {
  const t = await getTranslations("Generator");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink">{t("chooseTopic")}</h2>

      <form method="get" className="flex flex-col gap-3">
        {/* Tur va qadam saqlanadi — forma yuborilganda sehrgar orqaga
            qaytib ketmasligi kerak. */}
        <input type="hidden" name="tur" value={params.type ?? "dars"} />
        <input type="hidden" name="qadam" value="mavzu" />

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("subject")}
            <select
              name="fan"
              defaultValue={selectedSubject}
              className="h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
            >
              {subjects.map((subject) => (
                <option key={subject.slug} value={subject.slug}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("grade")}
            <select
              name="sinf"
              defaultValue={String(selectedGrade)}
              className="h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
            >
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {t("gradeLabel", { grade })}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-2">
            {t("quarter")}
            <select
              name="chorak"
              defaultValue={params.quarter === null ? "" : String(params.quarter)}
              className="h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
            >
              <option value="">{t("allQuarters")}</option>
              {QUARTERS.map((quarter) => (
                <option key={quarter} value={quarter}>
                  {t("quarterLabel", { number: quarter })}
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
                kerak. Primitivni o'zgartirish admin formalariga tegardi. */}
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

      {emptyMessage !== null ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
          {emptyMessage}
        </p>
      ) : (
        <TopicPicker params={params} tree={tree} results={results} />
      )}
    </div>
  );
}
