import { quoteParts, twoColumns, type SlideBlock } from "@/lib/slides/deck";

/**
 * Ko'rinish -> slayd markup'i.
 *
 * HAMMASI SERVER KOMPONENT: slaydlar RSC payload'ida HTML bilan keladi,
 * ya'ni sahifa ochilgandan keyin taqdimot internetga BOG'LIQ EMAS
 * (`taqdimot/page.tsx` izohiga qarang). Klient kod faqat navigatsiya
 * qobig'ida.
 *
 * `default` TARMOG'I ATAYLAB YO'Q (`components/editor/blocks/index.tsx`
 * bilan bir xil sabab): `SLIDE_LAYOUTS` ga yettinchi ko'rinish qo'shilsa
 * TypeScript shu yerda yiqiladi va yangi ko'rinish jimgina bo'sh ekran
 * bermaydi.
 *
 * Har ko'rinishning qoidasi `lib/documents/blocks.ts:SLIDE_LAYOUTS` izohida
 * yozilgan; `twoColumns` va `quoteParts` esa `lib/slides/deck.ts` da sof
 * funksiya sifatida — ular testlanadi, bu fayl faqat render.
 */
export function SlideLayout({ slide }: { slide: SlideBlock }) {
  switch (slide.layout) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "section":
      return <SectionSlide slide={slide} />;
    case "bullets":
      return <BulletsSlide slide={slide} />;
    case "two-column":
      return <TwoColumnSlide slide={slide} />;
    case "quote":
      return <QuoteSlide slide={slide} />;
    case "question":
      return <QuestionSlide slide={slide} />;
  }
}

/** Punktlar ro'yxati — belgi CSS'dan (`.slide-bullet::before`). */
function Bullets({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="slide-bullets">
      {items.map((item, i) => (
        <li key={i} className="slide-bullet">
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bosh slayd: sarlavha markazda, birinchi punkt ost sarlavha. */
function TitleSlide({ slide }: { slide: SlideBlock }) {
  const subtitle = slide.bullets[0];
  return (
    <>
      <h1 className="slide-title">{slide.title}</h1>
      {subtitle !== undefined && <p className="slide-subtitle">{subtitle}</p>}
    </>
  );
}

/**
 * Bo'lim ajratgichi: FAQAT sarlavha.
 *
 * Punktlar ATAYLAB chiqarilmaydi — `SLIDES_GUIDE` modelga bu ko'rinishda
 * punkt yozmaslikni aytadi, lekin muharrirda qo'shilgan bo'lsa ham ekranda
 * ko'rinmaydi: bo'lim slaydi bitta fikr bilan ishlaydi.
 */
function SectionSlide({ slide }: { slide: SlideBlock }) {
  return <h2 className="slide-title">{slide.title}</h2>;
}

function BulletsSlide({ slide }: { slide: SlideBlock }) {
  return (
    <>
      <h2 className="slide-title">{slide.title}</h2>
      <Bullets items={slide.bullets} />
    </>
  );
}

/** Ikki ustun: punktlar ketma-ket yarmiga bo'linadi (`twoColumns`). */
function TwoColumnSlide({ slide }: { slide: SlideBlock }) {
  const { left, right } = twoColumns(slide.bullets);
  return (
    <>
      <h2 className="slide-title">{slide.title}</h2>
      <div className="slide-columns">
        <Bullets items={left} />
        <Bullets items={right} />
      </div>
    </>
  );
}

/**
 * Iqtibos: BIRINCHI PUNKT iqtibosning o'zi, ikkinchisi manba.
 *
 * Sarlavha ustida kichik yozuv bo'lib qoladi. Punkt umuman bo'lmasa
 * sarlavhaning o'zi katta shriftda chiqadi — bo'sh ekran bermaslik uchun.
 */
function QuoteSlide({ slide }: { slide: SlideBlock }) {
  const { quote, source } = quoteParts(slide.bullets);

  if (quote === null) return <h2 className="slide-title">{slide.title}</h2>;

  return (
    <>
      <p className="slide-subtitle">{slide.title}</p>
      <blockquote className="slide-quote">{quote}</blockquote>
      {source !== null && <p className="slide-quote-source">{source}</p>}
    </>
  );
}

/** Savol: sarlavha eng katta shriftda, punktlar variant yoki yo'naltiruvchi fikr. */
function QuestionSlide({ slide }: { slide: SlideBlock }) {
  return (
    <div className="slide-question flex flex-col gap-[inherit]">
      <h2 className="slide-title">{slide.title}</h2>
      <Bullets items={slide.bullets} />
    </div>
  );
}
