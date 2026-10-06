import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GameSheet } from "@/components/games/registry";
import { PrintButton } from "@/components/games/print-button";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentContent } from "@/lib/documents/blocks";
import { documentHeading, firstGameBlock } from "@/lib/games/document";
import { buildGame, GAMES } from "@/lib/games/registry";
import { readVariant, seedForVariant, variantHref, VARIANTS } from "@/lib/games/variant-params";
import { Link, redirect } from "@/lib/i18n/navigation";
import type { RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import "@/components/games/games.css";

/**
 * Chop etiladigan varaq — A4 (15-sessiya).
 *
 * SERVER KOMPONENT, interaktivlik faqat chop etish tugmasida. Varaq
 * JavaScript'siz ham to'liq ko'rinadi va chop etiladi (Ctrl+P).
 *
 * `?variant=N` SHU YERDA HAM O'QILADI — doskada ham, varaqda ham bitta
 * `lib/games/variant-params.ts` orqali. Spetsifikatsiyaning "4-variant"
 * g'oyasining asosiy sababi — yonma-yon o'tirgan o'quvchilar bir-biridan
 * KO'CHIRA OLMASIN — aynan chop etilgan varaqda kerak; variant faqat
 * doskada ishlasa g'oya eng muhim joyda ishlamay qolardi.
 *
 * G'ILDIRAK UCHUN `notFound()`: spetsifikatsiya "Varaq yo'q" deydi.
 * Qaror `GAMES[kind].hasSheet` da yashaydi, ya'ni bu marshrut, muharrir
 * kartasi va hujjat ko'rinishi bitta manbaga qaraydi.
 */

export default async function VaraqPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = (await auth())!;
  const tG = await getTranslations("Games");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { title: true, type: true, status: true, contentJson: true },
  });

  if (!doc || doc.type !== "GAME") notFound();

  if (doc.status === "QUEUED" || doc.status === "RUNNING") {
    redirect({ href: `/ish/hujjat/${id}`, locale: await getLocale() });
  }

  const parsed = DocumentContent.safeParse(doc.contentJson);
  const block = parsed.success ? firstGameBlock(parsed.data) : null;

  if (block === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <p className="text-sm text-ink">{tG("empty")}</p>
        <Link
          href={`/ish/hujjat/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "self-start")}
        >
          {tG("back")}
        </Link>
      </div>
    );
  }

  // Varaqsiz o'yin (g'ildirak) — rost javob `notFound()`. "Varaq yo'q"
  // xabarini ko'rsatish o'qituvchini havolani qidirishga majburlardi,
  // holbuki havola bizning ekranlarimizda umuman ko'rsatilmaydi.
  if (!GAMES[block.content.kind].hasSheet) notFound();

  const variant = readVariant(await searchParams);
  const seed = seedForVariant({ documentId: id, blockSeed: block.seed, variant });
  const game = buildGame(block.content, seed);
  const pathname = `/ish/hujjat/${id}/varaq`;
  const heading = parsed.success ? documentHeading(parsed.data) : null;

  return (
    <div className="game-paper">
      <nav className="game-chrome mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/ish/hujjat/${id}`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          {tG("back")}
        </Link>

        <Link
          href={variantHref(`/ish/hujjat/${id}/oyin`, variant)}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          {tG("open")}
        </Link>

        <PrintButton label={tG("print")} hint={tG("printHint")} />

        <span className="ml-auto flex flex-wrap items-center gap-1">
          {VARIANTS.map((value) => (
            <Link
              key={value}
              href={variantHref(pathname, value)}
              aria-current={value === variant ? "true" : undefined}
              className={buttonVariants({
                variant: value === variant ? "default" : "outline",
                size: "sm",
              })}
            >
              {tG("variant", { variant: value + 1 })}
            </Link>
          ))}
        </span>
      </nav>

      {/* Sarlavha QOG'OZDA HAM qoladi (`game-chrome` emas): o'qituvchi
          qaysi varaq ekanini bilishi kerak. Variant raqami ham — aks holda
          to'rt xil varaqni ajratib bo'lmasdi. */}
      <h1 className="sheet-title">{heading ?? doc.title}</h1>
      <p className="sheet-meta">{tG("variant", { variant: variant + 1 })}</p>

      <GameSheet game={game} />
    </div>
  );
}
