import { GraduationCap } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { DevLoginForm } from "@/components/auth/dev-login-form";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Telegram widget'ida o'zbek locale'i yo'q — lotin/kirill uchun inglizcha. */
function widgetLang(locale: string): string {
  return locale === "ru" ? "ru" : "en";
}

const KNOWN_ERRORS = [
  "missing_hash",
  "invalid_payload",
  "bad_hash",
  "expired",
  "sozlanmagan",
] as const;

// `headers()` chaqirilgani uchun sahifa avtomatik dinamik bo'ladi — bu
// kerakli: dev-login shartini har so'rovda qayta baholash uchun ham.
export const dynamic = "force-dynamic";

export default async function KirishPage({
  searchParams,
}: {
  searchParams: Promise<{ xato?: string }>;
}) {
  const t = await getTranslations("Auth");
  const locale = await getLocale();
  const { xato } = await searchParams;

  // `NEXT_PUBLIC_APP_URL` kabi qo'shimcha env kerak emas — so'rov
  // sarlavhalaridan quriladi, shuning uchun preview alias'larda ham ishlaydi.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const authUrl = `${proto}://${host}/api/auth/telegram/${locale}`;

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const errorMessage =
    xato && (KNOWN_ERRORS as readonly string[]).includes(xato)
      ? t(`errors.${xato as (typeof KNOWN_ERRORS)[number]}`)
      : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <GraduationCap className="size-8 text-accent" strokeWidth={1.5} />
        <h1 className="font-heading text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="text-sm text-ink-2">{t("tagline")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("loginWith")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage && (
            <p role="alert" className="rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
              {errorMessage}
            </p>
          )}

          {botUsername ? (
            <TelegramLoginButton
              botUsername={botUsername}
              authUrl={authUrl}
              lang={widgetLang(locale)}
            />
          ) : (
            <p className="text-sm text-ink-2">{t("widgetUnavailable")}</p>
          )}

          {process.env.NODE_ENV === "development" &&
            process.env.DEV_LOGIN_ENABLED === "true" && (
              <DevLoginForm label={t("devLogin")} />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
