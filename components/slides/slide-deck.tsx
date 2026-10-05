import { getTranslations } from "next-intl/server";
import { SlideLayout } from "@/components/slides/layouts";
import { slideLabel, type SlideBlock } from "@/lib/slides/deck";

/**
 * Butun taqdimotning markup'i — SERVER KOMPONENT.
 *
 * Bu daraxt `SlidePlayer` ga `children` sifatida uzatiladi, ya'ni klient
 * qobiq uni o'rab turadi lekin qayta render qilmaydi. Shuning uchun
 * slaydlar HTML bilan birga keladi va JavaScript yuklanmasa ham ko'rinadi;
 * `scroll-snap` esa surishni nativ qiladi.
 *
 * `children` FUNKSIYA PROP EMAS, ya'ni `tests/client-props-guard.test.ts`
 * dagi server->klient chegarasi qoidasi buzilmaydi.
 */
export async function SlideDeck({
  slides,
  showNotes,
}: {
  slides: readonly SlideBlock[];
  /** `?izoh=bor` — izohlar slayd ostida chiqadi va chop etishda ham qoladi. */
  showNotes: boolean;
}) {
  const tS = await getTranslations("Slides");

  return (
    <div className="slide-deck" id="slide-deck">
      {slides.map((slide, index) => {
        const label = slideLabel(index, slides.length);
        return (
          <section
            key={slide.id}
            id={`slayd-${String(index + 1)}`}
            className="slide-frame"
            data-layout={slide.layout}
            data-slide-index={index}
            aria-label={tS("slideOf", label)}
          >
            <SlideLayout slide={slide} />

            {showNotes && slide.notes !== undefined && (
              <p className="slide-notes mt-auto border-t border-line pt-3 text-sm text-ink-2">
                <span className="font-medium">{tS("notes")}: </span>
                {slide.notes}
              </p>
            )}

            {/* Slayd raqami ekranda foydali, qog'ozda chalg'ituvchi —
                `slide-chrome` uni chop etishda yashiradi. */}
            <span className="slide-number slide-chrome">{tS("slideOf", label)}</span>
          </section>
        );
      })}
    </div>
  );
}
