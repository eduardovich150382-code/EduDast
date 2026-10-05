import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BalanceChip } from "@/components/credits/balance-chip";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { requireOnboarded } from "@/lib/auth";
import { logout } from "@/server/auth-actions";

export default async function IshLayout({ children }: { children: ReactNode }) {
  // Ish stolining butun bo'limi shu yerda himoyalanadi: kirmagan yoki
  // onboarding tugallanmagan foydalanuvchi bu yerga umuman yetib
  // kelmaydi (proxy.ts marshrutlaydi, bu esa haqiqiy chegara).
  await requireOnboarded();
  const t = await getTranslations("Ish");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 print:hidden sm:px-6">
        <div className="flex items-center gap-2 text-ink">
          <GraduationCap className="size-5" strokeWidth={1.5} />
          <span className="font-heading text-base font-semibold">EduDast</span>
        </div>
        <div className="flex items-center gap-2">
          <BalanceChip />
          <ThemeToggle />
          <LocaleSwitcher />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="touch">
              {t("logout")}
            </Button>
          </form>
        </div>
      </header>

      {/* Navigatsiya ALOHIDA QATORDA, sarlavha ichida emas: 390 px da o'ng
          klaster allaqachon to'la (balans + tema + til + chiqish). Sessiya
          hujjatida `/ish/hujjatlar` ga havola umuman yo'q edi — usiz
          sahifaga faqat manzilni qo'lda yozib yetib borish mumkin. */}
      <nav className="flex gap-1 border-b border-line px-4 py-1.5 print:hidden sm:px-6">
        <Link
          href="/ish"
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          {t("nav.week")}
        </Link>
        <Link
          href="/ish/hujjatlar"
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          {t("nav.documents")}
        </Link>
        <Link
          href="/ish/sozlamalar"
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          {t("nav.settings")}
        </Link>
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}
