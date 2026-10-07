import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import type { Block } from "@/lib/documents/blocks";
import { gameItemCount } from "@/lib/games/content";

/**
 * Bloklarni o'qishga qulay ko'rinishda chiqaradi.
 *
 * SERVER komponent: `getTranslations` ni o'zi chaqiradi, shuning uchun
 * tarjimalarni prop sifatida uzatish kerak emas (`"use client"` bo'lganda
 * kerak bo'lardi — `tests/client-props-guard.test.ts`).
 *
 * TAHRIRLASH YO'Q — 13-sessiya. Bu yerda faqat ko'rsatish.
 */

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {title !== undefined && (
        <h2 className="font-heading text-sm font-semibold tracking-wide text-ink-2 uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink marker:text-ink-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export async function DocumentBlocks({ blocks }: { blocks: Block[] }) {
  const t = await getTranslations("Documents");
  // `tE` NOMI MUHIM: i18n skaneri nomfazani O'ZGARUVCHI NOMI bo'yicha
  // bog'laydi, ikkala translator ham `t` bo'lsa kalit noto'g'ri nomfazada
  // tekshirilib, jimgina o'tib ketardi (CLAUDE.md "Tekshirish tuzoqlari").
  // Slayd ko'rinishi nomlari muharrir lug'atida — ularni `Documents` ga
  // nusxalash ikki manba yasardi.
  const tE = await getTranslations("Editor");
  // Uchinchi nomfaza, uchinchi ALOHIDA nom: `i18n-usage` skaneri nomfazani
  // o'zgaruvchi NOMI bo'yicha bog'laydi, ikki binding bir xil atalsa kalit
  // noto'g'ri nomfazada tekshirilib jimgina o'tib ketardi.
  const tG = await getTranslations("Games");

  return (
    <div className="flex flex-col gap-6">
      {/*
        QAYTISH TURI (`: ReactElement`) — "default tarmog'i yo'q" kafolatining
        O'ZI. Annotatsiyasiz yetishmagan `case` shunchaki `undefined` beradi
        va blok ekranda JIMGINA yo'qoladi; `tsc` esa React komponenti
        `undefined` qaytarishi mumkin bo'lgani uchun xato bermaydi.
        15-sessiyada `game` turi qo'shilganda aynan shunday bo'ldi.
      */}
      {blocks.map((block): ReactElement => {
        switch (block.type) {
          case "heading":
            return (
              <h1
                key={block.id}
                className="font-heading text-2xl font-semibold text-balance text-ink"
              >
                {block.text}
              </h1>
            );

          case "paragraph":
            return (
              <p key={block.id} className="text-sm leading-relaxed text-ink">
                {block.text}
              </p>
            );

          case "list":
            return (
              <Section key={block.id}>
                {block.style === "ordered" ? (
                  <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink marker:text-ink-2">
                    {block.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <Bullets items={block.items} />
                )}
              </Section>
            );

          case "table":
            return (
              <Section key={block.id} title={block.caption}>
                {/* Mobil birinchi: jadval keng bo'lsa gorizontal suriladi,
                    sahifaning o'zi emas. */}
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-md border-collapse text-sm">
                    <thead>
                      <tr>
                        {block.headers.map((header, i) => (
                          <th
                            key={i}
                            className="border border-line bg-muted px-2 py-1.5 text-left font-medium text-ink"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td key={c} className="border border-line px-2 py-1.5 text-ink">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            );

          case "objectives":
            return (
              <Section key={block.id} title={t("objectives")}>
                <Bullets items={block.items} />
              </Section>
            );

          case "materials":
            return (
              <Section key={block.id} title={t("materials")}>
                <Bullets items={block.items} />
              </Section>
            );

          case "stages":
            return (
              <Section key={block.id} title={t("stages")}>
                <ol className="flex flex-col gap-3">
                  {block.items.map((stage, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-2 rounded-xl border border-line px-3 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{stage.title}</span>
                        <span className="text-xs text-ink-2">
                          {t("minutes", { count: stage.minutes })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 text-sm">
                        <div>
                          <span className="text-xs font-medium text-ink-2">{t("teacher")}</span>
                          <Bullets items={stage.teacherActions} />
                        </div>
                        <div>
                          <span className="text-xs font-medium text-ink-2">{t("student")}</span>
                          <Bullets items={stage.studentActions} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            );

          case "question":
            return (
              <Section key={block.id}>
                <p className="text-sm font-medium text-ink">{block.text}</p>
                {block.options.length > 0 && <Bullets items={block.options} />}
                {block.pairs !== undefined && (
                  <ul className="flex flex-col gap-1">
                    {block.pairs.map((pair, i) => (
                      <li key={i} className="flex flex-wrap gap-2 text-sm text-ink">
                        <span>{pair.left}</span>
                        <span className="text-ink-2">—</span>
                        <span>{pair.right}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-ink-2">
                  {t("answer")}: {block.answer}
                </p>
              </Section>
            );

          case "answerKey":
            return (
              <Section key={block.id} title={t("answerKey")}>
                <Bullets
                  items={block.items.map((item) =>
                    item.explanation === undefined
                      ? item.answer
                      : `${item.answer} — ${item.explanation}`,
                  )}
                />
              </Section>
            );

          case "rubric":
            return (
              <Section key={block.id} title={t("rubric")}>
                <ul className="flex flex-col gap-2">
                  {block.criteria.map((criterion, i) => (
                    <li key={i} className="rounded-xl border border-line px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{criterion.name}</span>
                        <span className="text-xs text-ink-2">
                          {t("points", { count: criterion.maxPoints })}
                        </span>
                      </div>
                      <Bullets items={criterion.descriptors} />
                    </li>
                  ))}
                </ul>
              </Section>
            );

          case "homework":
            return (
              <Section key={block.id} title={t("homework")}>
                <Bullets items={block.items} />
                {block.estimatedMinutes !== undefined && (
                  <p className="text-xs text-ink-2">
                    {t("estimatedMinutes", { count: block.estimatedMinutes })}
                  </p>
                )}
              </Section>
            );

          case "note":
            return (
              <p
                key={block.id}
                className={
                  block.tone === "warning"
                    ? "rounded-md bg-warn/10 px-3 py-2 text-sm text-ink"
                    : "rounded-md bg-muted px-3 py-2 text-sm text-ink"
                }
              >
                {block.text}
              </p>
            );

          // Ko'ruvchida slayd KARTA sifatida chiqadi, taqdimot sifatida emas:
          // bu sahifa telefonda o'qish uchun. Haqiqiy taqdimot rejimi —
          // `/ish/hujjat/[id]/taqdimot` (14-sessiya, ikkinchi PR).
          case "slide":
            return (
              <Section key={block.id} title={t("slide")}>
                <div className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-heading text-sm font-semibold text-ink">
                      {block.title}
                    </span>
                    <span className="text-xs text-ink-2">
                      {t("slideLayout")}: {tE(`enum.layout.${block.layout}`)}
                    </span>
                  </div>
                  {block.bullets.length > 0 && <Bullets items={block.bullets} />}
                  {block.notes !== undefined && (
                    <p className="text-xs text-ink-2">
                      {t("slideNotes")}: {block.notes}
                    </p>
                  )}
                </div>
              </Section>
            );

          // O'yin ham KARTA sifatida: mazmun ro'yxati emas, qisqa xulosa.
          // So'zlar ro'yxatini bu yerda chiqarish javoblarni oshkor qilardi
          // (anagrammada bola ko'rishi kerak bo'lgan narsa — ta'rif, so'z
          // emas). Haqiqiy o'yin — `/ish/hujjat/[id]/oyin`.
          case "game":
            return (
              <Section key={block.id} title={tG("title")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="font-heading text-sm font-semibold text-ink">
                    {tG(`kind.${block.content.kind}`)}
                  </span>
                  <span className="text-xs text-ink-2">
                    {tE("field.gameItems", { count: gameItemCount(block.content) })}
                  </span>
                </div>
              </Section>
            );
        }
      })}
    </div>
  );
}
