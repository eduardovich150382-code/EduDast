"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { presenterView, slideLabel, type SlideBlock } from "@/lib/slides/deck";
import { Link } from "@/lib/i18n/navigation";
import { applyMove, keyToMove, swipeStep } from "@/lib/slides/navigation";
import { cn } from "@/lib/utils";

/**
 * Notiq ko'rinishi (`?rejim=notiq`).
 *
 * Asosiy pleyerdan farqi: snap konteyner YO'Q — joriy slayd, uning izohi va
 * keyingi slayd BIR EKRANDA turadi. Shuning uchun surish nativ bo'lmaydi va
 * `swipeStep` shu yerda ishlatiladi (asosiy pleyerda u kerak emas:
 * `scroll-snap` brauzerning o'zi bilan ishlaydi).
 *
 * Izoh bu ekranning BUTUN MAQSADI, shuning uchun u joriy slayddan keyin
 * darhol va to'liq ko'rinadi — kesilmaydi va yashirilmaydi.
 */
export function PresenterView({
  slides,
  labels,
  exitHref,
}: {
  slides: readonly SlideBlock[];
  labels: {
    prev: string;
    next: string;
    notes: string;
    noNotes: string;
    nextSlide: string;
    presenterExit: string;
    deckHint: string;
  };
  exitHref: string;
}) {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  const { current, next } = presenterView(slides, index);
  const label = slideLabel(index, total);

  /** Barmoq boshlangan nuqta va vaqt. `null` — surish ketmayapti. */
  const start = useRef<{ x: number; y: number; at: number } | null>(null);

  function move(direction: "next" | "prev") {
    setIndex((value) => applyMove(direction, value, total));
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const action = keyToMove(event.key);
      if (action === null) return;
      // `exit` bu ko'rinishda to'liq ekran bilan ishlaydi; qolgan hamma
      // tugmada `preventDefault()` SHART — sahifa o'zi aylanib ketmasin.
      if (action === "exit") {
        if (document.fullscreenElement !== null) void document.exitFullscreen();
        return;
      }
      event.preventDefault();
      setIndex((value) => applyMove(action, value, total));
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [total]);

  return (
    <div
      className="flex min-h-dvh flex-col gap-4 bg-paper px-4 py-4 sm:px-6"
      // `pointer` hodisalari: sichqoncha, barmoq va qalam uchun bitta yo'l.
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY, at: Date.now() };
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (from === null) return;
        const step = swipeStep({
          dx: event.clientX - from.x,
          dy: event.clientY - from.y,
          ms: Date.now() - from.at,
        });
        if (step === 1) move("next");
        if (step === -1) move("prev");
      }}
      // Barmoq ko'tarilmasdan oyna chetiga chiqib ketsa holat qolib
      // ketmasligi uchun.
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={exitHref}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }))}
        >
          {labels.presenterExit}
        </Link>
        <span className="text-sm text-ink-2 tabular-nums">
          {label.index}/{label.total}
        </span>
      </div>

      {/* Joriy slayd — sarlavha va punktlar MATNI.
          `SlideLayout` ATAYLAB ishlatilmadi: u faqat server daraxtida yashaydi
          (`SlideDeck`), bu yerga tortilsa oltita ko'rinish komponenti klient
          bundle'iga tushardi — asosiy pleyer uchun bekor yuk. Ayirboshlash
          ongli: notiq ekranida `two-column` va `quote` oddiy ro'yxat bo'lib
          ko'rinadi. O'qituvchiga "ekranda nima turgani" va izoh kerak, piksel
          aniqligi esa emas — u allaqachon doskaga qarab turadi. */}
      <div className="rounded-xl border border-line bg-surface px-4 py-4">
        {current === null ? (
          <p className="text-sm text-ink-2">{labels.deckHint}</p>
        ) : (
          <>
            <h1 className="font-heading text-xl font-semibold text-balance text-ink sm:text-2xl">
              {current.title}
            </h1>
            {current.bullets.length > 0 && (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink marker:text-accent sm:text-base">
                {current.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Izoh — notiq ko'rinishining BUTUN MAQSADI, shuning uchun u joriy
          slayddan keyin darhol va to'liq ko'rinadi. */}
      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-2 uppercase">
          {labels.notes}
        </h2>
        <p className="mt-1 text-base leading-relaxed text-ink">
          {current?.notes ?? labels.noNotes}
        </p>
      </div>

      <div className="flex items-start justify-between gap-3">
        {/* Keyingi slayd: FAQAT sarlavha va punktlar matni — kichik nusxasi
            emas. O'qituvchiga "keyin nima bo'ladi" degan savolga javob
            kerak, piksel-aniq ko'rinish esa emas. */}
        <div className="min-w-0 grow rounded-xl border border-dashed border-line px-4 py-3">
          <h2 className="text-xs font-medium tracking-wide text-ink-2 uppercase">
            {labels.nextSlide}
          </h2>
          {next === null ? (
            <p className="mt-1 text-sm text-ink-2">—</p>
          ) : (
            <>
              <p className="mt-1 truncate text-sm font-medium text-ink">{next.title}</p>
              {next.bullets.length > 0 && (
                <p className="truncate text-xs text-ink-2">{next.bullets.join(" · ")}</p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            aria-label={labels.prev}
            disabled={index <= 0}
            onClick={() => {
              move("prev");
            }}
          >
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            aria-label={labels.next}
            disabled={index >= total - 1}
            onClick={() => {
              move("next");
            }}
          >
            <ChevronRight className="size-5" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
