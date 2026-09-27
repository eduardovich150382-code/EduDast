"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";

/**
 * Generatsiya konveyerini HAYDAYDIGAN komponent.
 *
 * Bosqichlarni ketma-ket POST qiladi va har muvaffaqiyatdan keyin
 * `router.refresh()` chaqiradi — server komponent yangi bloklarni
 * ko'rsatadi. Bosqich raqami serverda (`inputParams.progress`), shuning
 * uchun brauzer yopilib qayta ochilsa ham o'sha joydan davom etadi: bu
 * komponent shunchaki `POST` qilaveradi, kursorni server biladi.
 *
 * NEGA `useTranslations`: bu client komponent `NextIntlClientProvider`
 * ichida (`app/[locale]/layout.tsx`), ya'ni tarjimalarni prop sifatida
 * uzatish shart emas. Funksiya prop uzatish esa TAQIQLANGAN
 * (`tests/client-props-guard.test.ts`).
 */

type Props = {
  documentId: string;
  /** Serverdan kelgan boshlang'ich kursor. */
  stage: number;
  total: number;
};

/**
 * Bitta bosqich uchun klient tomonidagi urinish shifti.
 *
 * Serverdagi `MAX_ATTEMPTS` dan MUSTAQIL ikkinchi qavat: server pulni
 * himoya qiladi (uchinchi urinishdan keyin kreditni qaytaradi), bu esa
 * brauzerni — cheksiz tsikl telefon batareyasini yeydi.
 */
const MAX_CLIENT_ATTEMPTS = 3;

/** 409 (boshqa ishchi band) — qisqa kutish yetadi. */
const BUSY_PAUSE_MS = 2_000;

type Phase = "idle" | "running" | "waiting" | "stopped";

export function StageRunner({ documentId, stage, total }: Props) {
  const t = useTranslations("Generator");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [current, setCurrent] = useState(stage);

  // `useRef`: tsikl ichidagi qarorlar render'ga bog'liq bo'lmasligi kerak.
  // State bilan qilinsa har `setState` yangi effekt yurgizib, ikkita
  // parallel tsikl paydo bo'lardi (va ikki barobar POST).
  const attemptsRef = useRef(0);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);

  const drive = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      for (;;) {
        if (cancelledRef.current) return;

        if (attemptsRef.current >= MAX_CLIENT_ATTEMPTS) {
          setPhase("stopped");
          return;
        }

        setPhase("running");
        const response = await fetch(`/api/generate/${documentId}/bosqich`, {
          method: "POST",
        });
        const body: unknown = await response.json().catch(() => null);
        const data = (body ?? {}) as {
          ok?: boolean;
          status?: string;
          stage?: number;
          total?: number;
          retryAfterSeconds?: number;
        };

        if (response.status === 409) {
          // Boshqa ishchi shu bosqichni egallagan (masalan ikkinchi
          // yorliq). Kursor o'zgargan bo'lishi mumkin — sahifani
          // yangilab, qisqa kutamiz.
          attemptsRef.current += 1;
          router.refresh();
          await sleep(BUSY_PAUSE_MS);
          continue;
        }

        if (response.status === 503) {
          attemptsRef.current += 1;
          const seconds = data.retryAfterSeconds ?? 90;
          setPhase("waiting");
          await countDown(seconds, setCountdown, cancelledRef);
          continue;
        }

        if (!response.ok || data.ok !== true) {
          // `FAILED` ham shu tarmoqqa tushadi: kredit qaytarilgan,
          // qayta urinish YANGI hujjat talab qiladi.
          setPhase("stopped");
          router.refresh();
          return;
        }

        // Muvaffaqiyat — urinishlar hisobi nolga qaytadi: shift BITTA
        // bosqich uchun, butun hujjat uchun emas.
        attemptsRef.current = 0;
        router.refresh();

        if (data.status === "DONE") {
          setPhase("idle");
          return;
        }

        if (typeof data.stage === "number") setCurrent(data.stage);
      }
    } finally {
      runningRef.current = false;
    }
  }, [documentId, router]);

  useEffect(() => {
    cancelledRef.current = false;
    void drive();
    return () => {
      // Sahifadan chiqilsa tsikl to'xtaydi. Serverdagi bosqich davom
      // etaveradi — u allaqachon egallangan va commit qiladi.
      cancelledRef.current = true;
    };
  }, [drive]);

  const label =
    phase === "waiting"
      ? t("waiting", { seconds: countdown })
      : `${t("running")} · ${t("stageLabel", { stage: current + 1, total })}`;

  if (phase === "stopped") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-3">
        <p className="text-sm text-ink">{t("giveUp")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            router.push("/ish/yarat");
          }}
        >
          <RefreshCw className="size-4" strokeWidth={1.5} />
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <p
      className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink-2"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin text-accent" strokeWidth={1.5} />
      {label}
    </p>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sanoqni ko'rsatib kutadi — foydalanuvchi osilib qolgan deb o'ylamasin. */
async function countDown(
  seconds: number,
  setCountdown: (value: number) => void,
  cancelled: { current: boolean },
): Promise<void> {
  for (let left = seconds; left > 0; left--) {
    if (cancelled.current) return;
    setCountdown(left);
    await sleep(1_000);
  }
}
