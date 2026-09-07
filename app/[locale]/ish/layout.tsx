import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
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
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-ink">
          <GraduationCap className="size-5" strokeWidth={1.5} />
          <span className="font-heading text-base font-semibold">EduDast</span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              {t("logout")}
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
