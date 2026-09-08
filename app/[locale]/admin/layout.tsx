import { BookOpen, LayoutDashboard, ListTree } from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin paneli — faqat `role === ADMIN`.
 *
 * `requireAdmin()` ADMIN bo'lmasa `notFound()` tashlaydi: kirmagan
 * foydalanuvchi ham, oddiy o'qituvchi ham AYNAN bir xil 404 ko'radi
 * (403 emas — /admin borligini bilish ham ortiqcha ma'lumot).
 *
 * proxy.ts va lib/auth/route-guards.ts BU YERGA TEGMAYDI: ular uchun
 * /admin oddiy "public" yo'l, ya'ni o'tkaziladi. Haqiqiy chegara — shu
 * layout va har bir action ichidagi `requireAdmin()` (server action
 * POST'i layout'dan O'TMAYDI, shuning uchun ikkalasi ham kerak).
 *
 * TIL: admin paneli faqat o'zbek tilida (lotin) — CLAUDE.md 1-qoidasiga
 * yozilgan istisno. Dizayn tokenlari qoidasi (2-qoida) esa amal qiladi.
 */

const NAV = [
  { href: "/admin", label: "Statistika", icon: LayoutDashboard },
  { href: "/admin/fanlar", label: "Fanlar", icon: BookOpen },
  { href: "/admin/mavzular", label: "Mavzular", icon: ListTree },
] as const;

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await requireAdmin();
  const { locale } = await params;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-line pb-4">
        <h1 className="font-heading text-xl font-semibold text-ink">EduDast admin</h1>
        <nav className="flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <item.icon className="size-4" strokeWidth={1.5} />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
