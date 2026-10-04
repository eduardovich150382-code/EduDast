import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routing } from "@/lib/i18n/routing";
import { logout } from "@/server/auth-actions";

/**
 * Sozlamalar (docs/sessions/12-eslatmalar.md, 7-band).
 *
 * `auth()` eslatma ustunlarini TANLAMAYDI (`lib/auth/index.ts` dagi
 * `findSessionUser` ro'yxati qisqa va ataylab shunday), shuning uchun
 * ular alohida o'qiladi. `requireAuth()` esa baribir chaqiriladi —
 * layout'dagi `requireOnboarded()` React `cache()` orqali qayta
 * ishlatiladi, ya'ni bu qo'shimcha so'rov emas.
 *
 * Ikki nomfazaga ALOHIDA nom berilgan (`tSettings`, `tLocale`): ikkalasi
 * `t` bo'lsa `i18n-usage` skaneri kalitni "yo u, yo bu nomfazada bor"
 * deb qabul qilardi va noto'g'ri nomfazadagi kalit jimgina o'tib ketardi
 * (CLAUDE.md "Tekshirish tuzoqlari").
 */
export default async function SozlamalarPage() {
  const user = await requireAuth();
  const tSettings = await getTranslations("Settings");
  const tLocale = await getTranslations("LocaleSwitcher");

  const prefs = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { remindersEnabled: true, weeklyDigestEnabled: true, locale: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">{tSettings("title")}</h1>

      <SettingsForm
        remindersEnabled={prefs.remindersEnabled}
        weeklyDigestEnabled={prefs.weeklyDigestEnabled}
        locale={prefs.locale}
        locales={routing.locales}
        labels={{
          reminders: {
            title: tSettings("reminders.title"),
            description: tSettings("reminders.description"),
          },
          digest: {
            title: tSettings("digest.title"),
            description: tSettings("digest.description"),
          },
          on: tSettings("on"),
          off: tSettings("off"),
          language: tSettings("language"),
          saved: tSettings("saved"),
          errors: {
            invalid: tSettings("errors.invalid"),
            generic: tSettings("errors.generic"),
          },
          localeNames: Object.fromEntries(routing.locales.map((loc) => [loc, tLocale(loc)])),
        }}
      />

      {/* Chiqish — layout'dagi bilan AYNI naqsh (`logout` ataylab
          `requireAuth()` siz: u muddati o'tgan sessiyada ham ishlashi
          kerak, sabab `server/auth-actions.ts` da). */}
      <form action={logout}>
        <Button type="submit" variant="outline" size="touch">
          {tSettings("logout")}
        </Button>
      </form>
    </div>
  );
}
