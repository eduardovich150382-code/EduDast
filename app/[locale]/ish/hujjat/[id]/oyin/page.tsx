import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GameBoard } from "@/components/games/registry";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentContent } from "@/lib/documents/blocks";
import { firstGameBlock } from "@/lib/games/document";
import { buildGame, GAMES } from "@/lib/games/registry";
import { readVariant, seedForVariant, variantHref, VARIANTS } from "@/lib/games/variant-params";
import { Link, redirect } from "@/lib/i18n/navigation";
import type { RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import "@/components/games/games.css";

/**
 * Doska rejimi — smart doska uchun to'liq ekran (15-sessiya).
 *
 * ⚠️ INTERNETSIZ ISHLASHI QABUL MEZONI — BU YERGA SO'ROV QO'SHMA.
 *
 * `taqdimot/page.tsx` dagi ayni qaror va ayni sabab: butun o'yin SERVERDA
 * quriladi (`buildGame`) va natija sahifa bilan birga HTML'ga tushadi.
 * Klient kodi faqat o'yin mexanikasi — `fetch` yo'q, `router.refresh()`
 * yo'q, polling yo'q. Xonada internet uzilsa ham o'yin oxirigacha
 * davom etadi.
 *
 * Shuning uchun bu marshrutga ma'lumot yuklaydigan har qanday klient
 * so'rovi (ball saqlash, tahlil, progress) qo'shilsa — u qabul mezonini
 * buzadi. Ball o'yin ichida, komponent holatida yashaydi.
 *
 * `?variant=N` — bir mazmundan boshqa panjara/aralashma
 * (`lib/games/variant-params.ts`). Varaq sahifasi ham AYNI parametrni
 * o'qiydi.
 */

export default async function OyinPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  // `tG` NOMI MUHIM: i18n skaneri nomfazani O'ZGARUVCHI NOMI bo'yicha
  // bog'laydi (CLAUDE.md "Tekshirish tuzoqlari").
  const tG = await getTranslations("Games");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { title: true, type: true, status: true, contentJson: true },
  });

  // Tur TEKSHIRILADI: dars ishlanmani o'yin sifatida ochish bo'sh ekran
  // berardi, `notFound()` esa rost javob.
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

  const variant = readVariant(await searchParams);
  const seed = seedForVariant({ documentId: id, blockSeed: block.seed, variant });
  const game = buildGame(block.content, seed);
  const pathname = `/ish/hujjat/${id}/oyin`;

  return (
    <>
      <GameBoard game={game} seed={seed} />

      {/* Chrome DOSKA TAGIDA: o'yin maydoni tepada turadi va barmoq
          bilan o'ynaganda tasodifan bosilmaydi. */}
      <nav className="game-chrome mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-4">
        <Link
          href={`/ish/hujjat/${id}`}
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          {tG("back")}
        </Link>

        {GAMES[block.content.kind].hasSheet && (
          <Link
            href={variantHref(`/ish/hujjat/${id}/varaq`, variant)}
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            {tG("openSheet")}
          </Link>
        )}

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
    </>
  );
}
