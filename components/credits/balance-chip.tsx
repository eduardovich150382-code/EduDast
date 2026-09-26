import { Coins } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";

/**
 * Header'dagi kredit balansi ko'rsatkichi.
 *
 * `auth()` React `cache()` bilan o'ralgan va `IshLayout` allaqachon
 * `requireOnboarded()` chaqirgan — bu yerda bazaga QAYTA borilmaydi.
 *
 * KO'RSATILADIGAN SON — MAVJUD balans (`creditBalance - creditsHeld`), brutto
 * emas: generatsiya davomida band qilingan kredit hali foydalanuvchining
 * ishlatishi mumkin bo'lgan puli emas. `creditsHeld > 0` bo'lganda band qismi
 * alohida ko'rinadi — aks holda balans generatsiya boshlanishi bilan sababsiz
 * kamaygan bo'lib ko'rinardi.
 *
 * YAGONA MANBA: `/ish` sahifasida ham ikkinchi balans ko'rsatkichi bo'lmasin.
 * Bitta ekranda ikkita son turishi — ertami-kechmi ular farq qiladi.
 */
export async function BalanceChip() {
  const user = await auth();
  if (!user) return null;

  const t = await getTranslations("Credits");
  // `Math.max` — himoya: ledger balansni manfiyga tushirmaydi, lekin
  // header hatto buzilgan ma'lumotda ham "-3" ko'rsatmasligi kerak.
  const available = Math.max(0, user.creditBalance - user.creditsHeld);

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-sm text-ink"
      aria-label={`${t("available")}: ${available}`}
    >
      <Coins className="size-4 text-warn" strokeWidth={1.5} />
      <span className="tabular-nums">{available}</span>
      {user.creditsHeld > 0 && (
        <span className="text-xs text-ink-2">{t("held", { count: user.creditsHeld })}</span>
      )}
    </div>
  );
}
