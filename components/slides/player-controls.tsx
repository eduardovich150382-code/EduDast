"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Printer,
  StickyNote,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { slideLabel } from "@/lib/slides/deck";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Pleyer boshqaruvi.
 *
 * `slide-chrome` sinfi — chop etishda butun panel yashiriladi
 * (`styles/slides.css`).
 *
 * REJIM VA IZOH TUGMALARI `<Link>`, `<button>` EMAS: ular holatni URL'ga
 * yozadi, ya'ni ulashiladi, reload'dan omon qoladi va JavaScript'siz ham
 * ishlaydi (`lib/slides/player-params.ts` izohi). Faqat haqiqatan
 * brauzerga tegadigan uchta amal tugma bo'lib qoladi: oldinga, orqaga va
 * to'liq ekran.
 */
export function PlayerControls({
  index,
  total,
  fullscreen,
  canFullscreen,
  labels,
  notesHref,
  backHref,
  presenterHref,
  onMove,
}: {
  index: number;
  total: number;
  fullscreen: boolean;
  canFullscreen: boolean;
  labels: {
    prev: string;
    next: string;
    fullscreen: string;
    fullscreenExit: string;
    print: string;
    printHint: string;
    notesShow: string;
    notesHide: string;
    notesOn: boolean;
    presenter: string;
    back: string;
    deckHint: string;
  };
  notesHref: string;
  backHref: string;
  presenterHref: string;
  onMove: (direction: "next" | "prev") => void;
}) {
  const label = slideLabel(index, total);

  function toggleFullscreen() {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
      return;
    }
    // `catch` SHART: brauzer foydalanuvchi harakatisiz yoki `iframe` da
    // rad etadi va ushlanmagan rejection konsolni to'ldirardi.
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  return (
    <div className="slide-chrome pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-between gap-2 p-3 sm:p-4">
      {/* Chap tomon: hujjatga qaytish va rejim havolalari. To'liq ekranda
          yashiriladi — ular sahifadan olib chiqadi, dars o'rtasida esa
          tasodifan bosilishi kerak emas. */}
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        {!fullscreen && (
          <>
            <Link
              href={backHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-touch" }),
                "bg-surface",
              )}
              aria-label={labels.back}
            >
              <ArrowLeft className="size-5" strokeWidth={1.5} />
            </Link>

            <Link
              href={presenterHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-touch" }),
                "bg-surface",
              )}
              aria-label={labels.presenter}
            >
              <Users className="size-5" strokeWidth={1.5} />
            </Link>

            <Link
              href={notesHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-touch" }),
                "bg-surface",
                labels.notesOn && "border-accent text-accent",
              )}
              aria-label={labels.notesOn ? labels.notesHide : labels.notesShow}
              aria-pressed={labels.notesOn}
            >
              <StickyNote className="size-5" strokeWidth={1.5} />
            </Link>

            {/* Chop etish — TUGMA, havola emas: u brauzerning chop etish
                oynasini ochadi. Nima chop etilishini URL hal qiladi
                (`?izoh=`), ya'ni o'qituvchi EKRANDA ko'rayotgan narsa
                qog'ozga tushadi. Yonidagi izoh almashtirgichi esa havola. */}
            <Button
              type="button"
              variant="outline"
              size="icon-touch"
              className="bg-surface"
              aria-label={labels.print}
              title={labels.printHint}
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="size-5" strokeWidth={1.5} />
            </Button>
          </>
        )}
      </div>

      {/* O'ng tomon: surish va to'liq ekran — dars davomida kerak bo'ladigan
          yagona boshqaruv, shuning uchun to'liq ekranda ham qoladi. */}
      <div className="pointer-events-auto flex items-center gap-2">
        <span className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink-2 tabular-nums">
          {label.index}/{label.total}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="bg-surface"
          aria-label={labels.prev}
          disabled={index <= 0}
          onClick={() => {
            onMove("prev");
          }}
        >
          <ChevronLeft className="size-5" strokeWidth={1.5} />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="bg-surface"
          aria-label={labels.next}
          disabled={index >= total - 1}
          onClick={() => {
            onMove("next");
          }}
        >
          <ChevronRight className="size-5" strokeWidth={1.5} />
        </Button>

        {/* Tugma FAQAT imkoniyat tasdiqlangandan keyin: iOS Safari'da
            `requestFullscreen` yo'q va o'lik tugma ko'rsatish kerak emas. */}
        {canFullscreen && (
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            className="bg-surface"
            aria-label={fullscreen ? labels.fullscreenExit : labels.fullscreen}
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize className="size-5" strokeWidth={1.5} />
            ) : (
              <Maximize className="size-5" strokeWidth={1.5} />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
