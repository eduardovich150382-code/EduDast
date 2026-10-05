import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PresenterView } from "@/components/slides/presenter-view";
import { SlideDeck } from "@/components/slides/slide-deck";
import { SlidePlayer } from "@/components/slides/slide-player";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentContent } from "@/lib/documents/blocks";
import { Link, redirect } from "@/lib/i18n/navigation";
import type { RawSearchParams } from "@/lib/search-params";
import { deckSlides } from "@/lib/slides/deck";
import {
  NOTES_PARAM,
  playerQuery,
  PRESENTER_PARAM,
  PRESENTER_VALUE,
  readPlayerView,
} from "@/lib/slides/player-params";
import { cn } from "@/lib/utils";
import "@/styles/slides.css";

/**
 * Taqdimot rejimi (14-sessiya).
 *
 * ⚠️ INTERNETSIZ ISHLASHI QABUL MEZONI — BU YERGA SO'ROV QO'SHMA.
 *
 * Butun kontent SERVER KOMPONENTDA render qilinadi va `contentJson` sahifa
 * bilan birga HTML'ga tushadi. Klient kod faqat navigatsiya qobig'i
 * (`SlidePlayer`), surish esa `scroll-snap` bilan NATIV. Ya'ni sahifa
 * ochilgandan keyin HECH QANDAY tarmoq chaqiruvi bo'lmaydi: `fetch` yo'q,
 * `router.refresh()` yo'q, polling yo'q. Xonada internet uzilsa ham
 * o'qituvchi taqdimotni oxirigacha ko'rsatadi.
 *
 * Shuning uchun bu marshrutga ma'lumot yuklaydigan har qanday klient so'rovi
 * (progress, avtosaqlash, tahlil) qo'shilsa — u qabul mezonini buzadi.
 *
 * NEGA ALOHIDA MARSHRUT, ko'ruvchidagi rejim emas: `/ish/hujjat/[id]`
 * telefonda o'qish uchun — chrome, sarlavha, sifat ogohlantirishi bilan.
 * Taqdimot esa butun ekranni egallaydi va u yerda hech narsa chalg'itmasligi
 * kerak (`tahrir/page.tsx` dagi ayni qaror).
 *
 * KO'RINISH HOLATI URL'DA (`?rejim=notiq`, `?izoh=bor`): ulashiladi,
 * reload'dan omon qoladi, JavaScript'siz ishlaydi va chop etilgan natija
 * ekranda ko'rinayotgan narsaga mos keladi (`lib/slides/player-params.ts`).
 */

export default async function TaqdimotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  // `tS` NOMI MUHIM: i18n skaneri nomfazani O'ZGARUVCHI NOMI bo'yicha
  // bog'laydi (CLAUDE.md "Tekshirish tuzoqlari").
  const tS = await getTranslations("Slides");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { title: true, type: true, status: true, contentJson: true },
  });

  // Tur TEKSHIRILADI: dars ishlanmani taqdimot sifatida ochish bo'sh ekran
  // berardi (`deckSlides` slayd topmaydi), `notFound()` esa rost javob.
  if (!doc || doc.type !== "SLIDES") notFound();

  // Generatsiya ketayotganda slaydlar hali yarim — ko'ruvchiga qaytaramiz,
  // u yerda progress ro'yxati bor (`tahrir/page.tsx` bilan bir xil yo'l).
  if (doc.status === "QUEUED" || doc.status === "RUNNING") {
    redirect({ href: `/ish/hujjat/${id}`, locale: await getLocale() });
  }

  const parsed = DocumentContent.safeParse(doc.contentJson);
  const slides = parsed.success ? deckSlides(parsed.data) : [];

  if (slides.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <p className="text-sm text-ink">{tS("empty")}</p>
        <Link
          href={`/ish/hujjat/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "self-start")}
        >
          {tS("back")}
        </Link>
      </div>
    );
  }

  const view = readPlayerView(await searchParams);
  const pathname = `/ish/hujjat/${id}/taqdimot`;

  if (view.presenter) {
    return (
      <PresenterView
        slides={slides}
        exitHref={hrefFor(pathname, playerQuery(view, { [PRESENTER_PARAM]: null }))}
        labels={{
          prev: tS("prev"),
          next: tS("next"),
          notes: tS("notes"),
          noNotes: tS("noNotes"),
          nextSlide: tS("nextSlide"),
          presenterExit: tS("presenterExit"),
          deckHint: tS("deckHint"),
        }}
      />
    );
  }

  return (
    <SlidePlayer
      total={slides.length}
      backHref={`/ish/hujjat/${id}`}
      presenterHref={hrefFor(
        pathname,
        playerQuery(view, { [PRESENTER_PARAM]: PRESENTER_VALUE }),
      )}
      // Izoh almashtirgichi HAVOLA: holat URL'da yashaydi, ya'ni chop
      // etilgan nusxa ekranda ko'rinayotgan narsaga mos keladi.
      notesHref={hrefFor(
        pathname,
        playerQuery(view, { [NOTES_PARAM]: view.notes ? "yoq" : "bor" }),
      )}
      labels={{
        prev: tS("prev"),
        next: tS("next"),
        fullscreen: tS("fullscreen"),
        fullscreenExit: tS("fullscreenExit"),
        print: tS("print"),
        printHint: tS("printHint"),
        notesShow: tS("notesShow"),
        notesHide: tS("notesHide"),
        notesOn: view.notes,
        presenter: tS("presenter"),
        back: tS("back"),
        deckHint: tS("deckHint"),
      }}
    >
      <SlideDeck slides={slides} showNotes={view.notes} />
    </SlidePlayer>
  );
}

/**
 * `pathname` + query -> satr havola.
 *
 * Nega obyekt `href` emas: `SlidePlayer` KLIENT komponent va unga obyekt
 * uzatish mumkin bo'lsa ham, satr havola bitta turdagi prop bo'lib qoladi —
 * `Link` ikkalasini ham qabul qiladi, lekin ikki shaklni aralashtirish
 * keyingi tahrirda chalkashtirardi.
 */
function hrefFor(pathname: string, query: Record<string, string>): string {
  const search = new URLSearchParams(query).toString();
  return search === "" ? pathname : `${pathname}?${search}`;
}
