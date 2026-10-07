import { getTranslations } from "next-intl/server";
import { StepConfirm } from "@/components/generation/step-confirm";
import { StepParams } from "@/components/generation/step-params";
import { StepTopic } from "@/components/generation/step-topic";
import { StepType } from "@/components/generation/step-type";
import type { PickerNode, PickerTopic } from "@/components/generation/topic-picker";
import { Wizard } from "@/components/generation/wizard";
import { auth } from "@/lib/auth";
import { creditCost } from "@/lib/credits/cost-table";
import { GAME_KINDS } from "@/lib/games/types";
import { searchTopics } from "@/lib/curriculum/search";
import { prisma } from "@/lib/db";
import {
  documentTypeFor,
  type SupportedDocumentType,
} from "@/lib/documents/type-param";
import {
  inferStep,
  parseWizardParams,
  previousStep,
  GAME_ITEM_COUNTS,
  QUESTION_COUNTS,
  SLIDE_COUNTS,
  resolveParams,
  resolveStep,
  startInputFor,
  wizardQuery,
  type WizardParams,
} from "@/lib/generation/wizard-params";
import { GRADES } from "@/lib/grades";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { subjectName } from "@/lib/subject-name";
import { topicTitle } from "@/lib/topic-title";

/**
 * Yaratish sehrgari — qadamli, holat `searchParams` da.
 *
 * NEGA SERVER COMPONENT (klient holat mashinasi emas):
 *   1. NARX SERVERDA hisoblanadi. `creditCost()` mijozga umuman o'tmaydi —
 *      formula ikki joyda yashasa, o'qituvchiga ko'rsatilgan narx bilan
 *      yechilgan kredit ertami-kechmi farq qilardi.
 *   2. Brauzerning "orqaga" tugmasi va havolani ulashish tekinga ishlaydi.
 *   3. JavaScript'siz ham yuradi: faqat oxirgi "Yaratish" tugmasi klient.
 *
 * Parametr shartnomasi va qadam mashinasi `lib/generation/wizard-params.ts`
 * da — sof modul, `tests/wizard-params.test.ts` bilan qoplangan. Bu sahifa
 * faqat BAZA ishini qiladi va qadamni tanlaydi.
 *
 * `?fan=&sinf=&chorak=&mavzu=` nomlari O'ZGARMADI, shuning uchun bosh
 * sahifa (`app/[locale]/ish/page.tsx` dagi `prepareHref`) va "Rejam"
 * havolalari hech qanday tahrirsiz ishlashda davom etadi. Ular `tur`
 * bermaydi — shunda sehrgar 1-qadamdan boshlanadi, lekin mavzu
 * TANLANGAN holda keyingi qadamlarga o'tadi.
 */

/** Qidiruv natijasi shifti — har chaqiruv bitta embedding puli turadi. */
const SEARCH_LIMIT = 20;

export default async function YaratPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const locale = await getAppLocale();
  const t = await getTranslations("Generator");
  const params = parseWizardParams(await searchParams);

  const subjectRows = await prisma.subject.findMany({
    where: { slug: { in: user.subjects } },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, nameUz: true, nameUzCyrl: true, nameRu: true },
  });
  const grades = GRADES.filter((grade) => user.grades.includes(grade));

  if (subjectRows.length === 0 || grades.length === 0) {
    return (
      <Wizard
        step="tur"
        title={t("title")}
        description={t("description")}
        backQuery={null}
      >
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-ink-2">
          {t("noSelection")}
        </p>
      </Wizard>
    );
  }

  // Mavzu RUXSAT bilan hal qilinadi: faqat o'qituvchining fan va sinf
  // ro'yxatidagi mavzu "tanlangan" hisoblanadi. Aks holda ulashilgan havola
  // bilan boshqa fan mavzusini tanlab, xatoni faqat "Yaratish" da ko'rardi.
  const topic =
    params.topicId === null
      ? null
      : await prisma.topic.findFirst({
          where: {
            id: params.topicId,
            deletedAt: null,
            grade: { in: grades },
            subject: { slug: { in: user.subjects } },
          },
          select: {
            id: true,
            grade: true,
            titleUz: true,
            titleUzCyrl: true,
            titleRu: true,
            subject: {
              select: { slug: true, nameUz: true, nameUzCyrl: true, nameRu: true },
            },
          },
        });

  const step = resolveStep(
    params.step,
    inferStep(params, { topicResolved: topic !== null }),
  );

  const docType: SupportedDocumentType =
    params.type === null ? "LESSON_PLAN" : documentTypeFor(params.type);

  // Sarlavha, tavsif va "Turi" qatori — `Record`, ternar EMAS: uchinchi tur
  // qo'shilganda ternar zanjiri uzayardi va unutilgan tur jimgina dars
  // ishlanma matnini ko'rsatardi.
  const TITLE_KEY: Record<SupportedDocumentType, string> = {
    LESSON_PLAN: "title",
    TEST: "titleTest",
    SLIDES: "titleSlides",
    GAME: "titleGame",
  };
  const DESCRIPTION_KEY: Record<SupportedDocumentType, string> = {
    LESSON_PLAN: "description",
    TEST: "descriptionTest",
    SLIDES: "descriptionSlides",
    GAME: "descriptionGame",
  };
  const TYPE_KEY: Record<SupportedDocumentType, string> = {
    LESSON_PLAN: "typeLesson",
    TEST: "typeTest",
    SLIDES: "typeSlides",
    GAME: "typeGame",
  };

  const title = t(TITLE_KEY[docType]);
  const description = t(DESCRIPTION_KEY[docType]);

  const previous = previousStep(step);
  const backQuery =
    previous === null ? null : wizardQuery(params, { qadam: previous });

  // Narx BITTA joyda hisoblanadi — tasdiqlash ekranidagi son bilan
  // `boshlaGeneratsiya` yechadigan kredit bir xil formuladan chiqishi uchun
  // (ikkisi ham `creditCost`, ikkisi ham serverda).
  const resolved = resolveParams(params);
  const cost =
    resolved.type === "TEST"
      ? creditCost({ type: "TEST", questionCount: resolved.questionCount })
      : resolved.type === "SLIDES"
        ? creditCost({ type: "SLIDES", slideCount: resolved.slideCount })
        : creditCost({ type: "LESSON_PLAN" });

  return (
    <Wizard
      step={step}
      title={title}
      description={description}
      backQuery={backQuery}
    >
      {step === "tur" && <StepType params={params} />}

      {step === "mavzu" &&
        (await renderTopicStep({ params, subjectRows, grades, locale, topic }))}

      {step === "param" && (
        <StepParams
          params={params}
          lessonCost={creditCost({ type: "LESSON_PLAN" })}
          // Har variantning narxi SERVERDA: formula mijozda takrorlansa,
          // ko'rsatilgan narx bilan yechilgan kredit farq qilishi mumkin edi.
          questionCosts={QUESTION_COUNTS.map((value) => ({
            value,
            cost: creditCost({ type: "TEST", questionCount: value }),
          }))}
          slideCosts={SLIDE_COUNTS.map((value) => ({
            value,
            cost: creditCost({ type: "SLIDES", slideCount: value }),
          }))}
          gameCosts={GAME_KINDS.map((kind) => ({
            kind,
            counts: GAME_ITEM_COUNTS[kind].map((value) => ({
              value,
              cost: creditCost({ type: "GAME", gameKind: kind, itemCount: value }),
            })),
          }))}
        />
      )}

      {step === "tasdiq" && topic !== null && (
        <StepConfirm
          input={startInputFor(params, topic.id)}
          summary={[
            { label: t("summaryType"), value: t(TYPE_KEY[docType]) },
            { label: t("summaryTopic"), value: topicTitle(topic, locale) },
            { label: t("summaryParams"), value: paramsSummary() },
          ]}
          cost={cost}
          // Mavjud balans = balans - band qilingan (`BalanceChip` bilan bir xil).
          balance={Math.max(0, user.creditBalance - user.creditsHeld)}
        />
      )}
    </Wizard>
  );

  /** Tasdiqlash ekranidagi "Parametrlar" qatori. */
  function paramsSummary(): string {
    switch (resolved.type) {
      case "TEST":
        return [
          t("questionCountLabel", { count: resolved.questionCount }),
          resolved.kinds.map((kind) => t(`kind.${kind}`)).join(", "),
          t(`difficulty.${resolved.difficulty}`),
        ].join(" · ");
      case "SLIDES":
        return t("slideCountLabel", { count: resolved.slideCount });
      case "GAME":
        return [
          t(`gameKindLabel.${resolved.gameKind}`),
          t("itemCountLabel", { count: resolved.itemCount }),
        ].join(" · ");
      case "LESSON_PLAN":
        return t("durationLabel", { minutes: resolved.durationMinutes });
    }
  }
}

type TopicStepArgs = {
  params: WizardParams;
  subjectRows: {
    id: string;
    slug: string;
    nameUz: string;
    nameUzCyrl: string;
    nameRu: string;
  }[];
  grades: number[];
  locale: Awaited<ReturnType<typeof getAppLocale>>;
  topic: { id: string } | null;
};

async function renderTopicStep({
  params,
  subjectRows,
  grades,
  locale,
}: TopicStepArgs) {
  const t = await getTranslations("Generator");

  const subject =
    subjectRows.find((row) => row.slug === params.subject) ?? subjectRows[0]!;
  const grade = grades.find((item) => item === params.grade) ?? grades[0]!;

  const results =
    params.query === ""
      ? null
      : await runSearch({ query: params.query, subjectId: subject.id, grade, locale });

  const topicRows = await prisma.topic.findMany({
    where: {
      subjectId: subject.id,
      grade,
      deletedAt: null,
      ...(params.quarter === null ? {} : { quarter: params.quarter }),
    },
    // `slug` ikkinchi mezon SHART — CSV'da `order` takrorlanadi va Postgres
    // teng qiymatlarda tartibni kafolatlamaydi (`rejam` bilan bir xil sabab).
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      parentId: true,
      titleUz: true,
      titleUzCyrl: true,
      titleRu: true,
    },
  });

  // Daraxt — `app/[locale]/admin/mavzular/page.tsx` naqshi.
  const childrenByParent = new Map<string, PickerTopic[]>();
  for (const row of topicRows) {
    if (row.parentId === null) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push({ id: row.id, title: topicTitle(row, locale) });
    childrenByParent.set(row.parentId, list);
  }
  const tree: PickerNode[] = topicRows
    .filter((row) => row.parentId === null)
    .map((row) => ({
      id: row.id,
      title: topicTitle(row, locale),
      children: childrenByParent.get(row.id) ?? [],
    }));

  // Bo'sh holatlar: chorak filtri bo'shatganini "mavzu yuklanmagan" dan
  // ajratish kerak — ikkisi o'qituvchidan boshqa-boshqa ish talab qiladi.
  let emptyMessage: string | null = null;
  if (results === null && topicRows.length === 0) {
    emptyMessage = params.quarter === null ? t("noTopics") : t("emptyQuarter");
  }

  return (
    <StepTopic
      params={params}
      subjects={subjectRows.map((row) => ({
        slug: row.slug,
        name: subjectName(row, locale),
      }))}
      grades={grades}
      selectedSubject={subject.slug}
      selectedGrade={grade}
      tree={tree}
      results={results}
      emptyMessage={emptyMessage}
    />
  );
}

/**
 * Mavzu qidiruvi.
 *
 * `searchTopics` ichida `embedQuery` bor — ya'ni HAR chaqiruv bitta
 * embedding LLM chaqiruvi. Shuning uchun u faqat forma yuborilganda
 * ishlaydi (`?q=`), hech qachon har harfda emas, va `limit` cheklangan.
 *
 * `mode` ("semantic" | "keyword") UI'ga CHIQARILMAYDI: o'qituvchiga uning
 * ma'nosi yo'q, va bu ichki sifat ko'rsatkichi uchun i18n kaliti
 * qo'shishga arzimaydi.
 */
async function runSearch({
  query,
  subjectId,
  grade,
  locale,
}: {
  query: string;
  subjectId: string;
  grade: number;
  locale: Awaited<ReturnType<typeof getAppLocale>>;
}): Promise<PickerTopic[]> {
  const { matches } = await searchTopics(query, {
    subjectId,
    grade,
    limit: SEARCH_LIMIT,
  });
  const ids = matches.map((match) => match.id);
  if (ids.length === 0) return [];

  // `TopicMatch` faqat `titleUz` olib yuradi — ru va uz-Cyrl uchun
  // qo'shimcha so'rov SHART, aks holda piker uchala tilda o'zbekcha
  // ko'rsatardi.
  const rows = await prisma.topic.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, titleUz: true, titleUzCyrl: true, titleRu: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  // `in` TARTIBNI SAQLAMAYDI — `ids` bo'yicha qayta tartiblash SHART,
  // aks holda semantik qidiruv relevantligini jimgina yo'qotardi.
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [{ id, title: topicTitle(row, locale) }];
  });
}
