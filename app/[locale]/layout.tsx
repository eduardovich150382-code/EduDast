import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/lib/i18n/routing";
import "../globals.css";

// Matn shrifti — oʻzbek lotin (ʻ/ʼ), kirill va lotin-kengaytirilgan
// belgilarni to'liq qoplaydi (styles/tokens.css dagi izohga qarang).
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-sans",
});

// Sarlavha shrifti — lotin va kirillni qoplaydi, lekin tor "modifier
// letter" diapazoni (ʻ/ʼ) kafolatlanmagan; shuning uchun stek Inter'ga
// tushadi (per-glyph fallback), butun so'z boshqa shriftga o'tmaydi.
const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-heading",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Statik render'ni yoqadi — bu layout va uning bolalari build vaqtida
  // har bir til uchun oldindan tayyorlanadi.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
