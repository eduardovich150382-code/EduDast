"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StartInput } from "@/lib/generation/start-input";
import { useRouter } from "@/lib/i18n/navigation";
import { boshlaGeneratsiya } from "@/server/generation-actions";

/**
 * 4-qadam: tasdiqlash. Sehrgardagi YAGONA klient komponent.
 *
 * NEGA SHU BITTASI KLIENT: server action'ni chaqirib, natijaga qarab
 * `router.push` qilish kerak. Qolgan uch qadam oddiy navigatsiya, shuning
 * uchun ular server component bo'lib qoladi va JavaScript'siz ishlaydi.
 *
 * `input` TAYYOR HOLDA SERVERDAN KELADI (`startInputFor` sahifada
 * chaqiriladi), narx ham shunday. Ya'ni `lib/credits/cost-table` bu
 * bundle'ga umuman tushmaydi — `StartInput` esa `import type`, kompilyatsiyada
 * o'chadi. Narxni mijozda qayta hisoblash TAQIQ: formula ikki joyda yashasa,
 * ko'rsatilgan narx bilan yechilgan kredit farq qilib ketardi.
 *
 * NEGA `useTranslations`: bu komponent `NextIntlClientProvider` ichida,
 * ya'ni tarjimani prop sifatida uzatish shart emas — funksiya prop uzatish
 * esa taqiqlangan (`tests/client-props-guard.test.ts`).
 */

type Props = {
  /** Serverda qurilgan action kirishi — oddiy serializable obyekt. */
  input: StartInput;
  /** Xulosa qatorlari: tur, mavzu, parametrlar. Serverda tarjima qilingan. */
  summary: { label: string; value: string }[];
  cost: number;
  /** Mavjud balans = creditBalance - creditsHeld. */
  balance: number;
};

export function StepConfirm({ input, summary, cost, balance }: Props) {
  const t = useTranslations("Generator");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const enough = balance >= cost;

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        {summary.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2 text-sm">
            <dt className="text-ink-2">{row.label}</dt>
            <dd className="font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{t("cost", { count: cost })}</p>
        <p className="text-xs text-ink-2">{t("balance", { count: balance })}</p>
      </div>

      {!enough && (
        <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-ink">
          {t("notEnough")}
        </p>
      )}

      <div>
        <Button
          type="button"
          size="touch"
          disabled={pending || !enough}
          onClick={() => {
            startTransition(async () => {
              const result = await boshlaGeneratsiya(input);
              if (result.ok) {
                // Muvaffaqiyatda toast YO'Q: navigatsiya bo'ladi va hujjat
                // sahifasining o'zi javob — ikkisi birga shovqin bo'lardi.
                router.push(`/ish/hujjat/${result.documentId}`);
                return;
              }
              // Aniq xabar, umumiy "nimadir xato ketdi" emas: `kredit`,
              // `ruxsat`, `topilmadi` o'qituvchidan boshqa-boshqa ish
              // talab qiladi.
              toast.error(t(`errors.${result.error}`));
            });
          }}
        >
          <Sparkles className="size-4" strokeWidth={1.5} />
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}
