import { AlertTriangle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/editor/document-editor";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentContent } from "@/lib/documents/blocks";
import { Link, redirect } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Hujjat muharriri (13-sessiya).
 *
 * NEGA ALOHIDA MARSHRUT, ko'ruvchidagi rejim almashtirgich EMAS: ko'ruvchi
 * server komponent bo'lib qoladi — tez, ulashiladi va JavaScript'siz
 * ochiladi. Almashtirgich uni klient daraxtiga o'rashni talab qilardi,
 * `DocumentBlocks` esa `async` server komponent (`getTranslations` ni o'zi
 * chaqiradi) va klient ichida ishlamaydi.
 *
 * GENERATSIYA KETAYOTGAN HUJJAT TAHRIRLANMAYDI: `lib/documents/lifecycle.ts`
 * dagi `commitStage` bloklarni `jsonb ||` bilan QO'SHIB boradi, muharrir
 * esa butun ustunni ALMASHTIRADI. Ikkisi bir vaqtda ketsa bosqich natijasi
 * jimgina yo'qolardi. `saveDocument` ham o'z `where` ida shu shartni
 * takrorlaydi — bu birinchi qavat, u ikkinchisi.
 */

export default async function TahrirPage({ params }: { params: Promise<{ id: string }> }) {
  // `IshLayout` allaqachon `requireOnboarded()` chaqirgan (React `cache()`).
  const user = (await auth())!;
  const tE = await getTranslations("Editor");
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { title: true, status: true, contentJson: true },
  });

  if (!doc) notFound();

  if (doc.status === "QUEUED" || doc.status === "RUNNING") {
    redirect({ href: `/ish/hujjat/${id}`, locale: await getLocale() });
  }

  const parsed = DocumentContent.safeParse(doc.contentJson);

  // BUZUQ KONTENTDA MUHARRIR OCHILMAYDI. Ko'ruvchi bunday hujjatni bo'sh
  // bloklar bilan ko'rsatadi va bu xavfsiz, muharrir esa o'zining bo'sh
  // talqinini saqlab, qolgan ma'lumotni butunlay yo'q qilardi.
  if (!parsed.success) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <p className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} />
          {tE("brokenContent")}
        </p>
        <Link
          href={`/ish/hujjat/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "self-start")}
        >
          {tE("back")}
        </Link>
      </div>
    );
  }

  return <DocumentEditor documentId={id} title={doc.title} initialContent={parsed.data} />;
}
