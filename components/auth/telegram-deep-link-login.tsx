"use client";

import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Telegram bot orqali kirish (deep-link oqimi).
 *
 * NEGA WIDGET EMAS: Login Widget brauzerda telefon raqami so'raydi va
 * tasdiqni Telegram xizmat chatiga yuboradi. Telefondagi o'qituvchi uchun
 * bu oqim tez-tez uzilib qoladi. Bu yerda foydalanuvchi shunchaki botga
 * o'tadi, "Start" bosadi va shu sahifaga qaytadi — sessiya AYNAN shu
 * brauzerda ochiladi (Telegram'ning ichki brauzerida emas).
 *
 * Holat so'rovi `code` ni bilishi shart emas: u httpOnly cookie ichida,
 * ya'ni bu komponentda hech qanday sir yo'q.
 */

const POLL_INTERVAL_MS = 2000;
/** Token 10 daqiqa yashaydi — so'rov ham shundan oshmasin. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type Holat = "boshlanmagan" | "ochilmoqda" | "kutilmoqda" | "xato";

type StatusResponse = { holat: "kutilmoqda" | "tayyor" | "yaroqsiz"; manzil?: string };

export function TelegramDeepLinkLogin({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    start: string;
    waiting: string;
    openAgain: string;
    error: string;
  };
}) {
  const [holat, setHolat] = useState<Holat>("boshlanmagan");
  const [deepLink, setDeepLink] = useState<string | null>(null);

  // Interval ID'si render'lar orasida saqlanishi kerak, lekin uni
  // o'zgartirish qayta render talab qilmaydi — shuning uchun ref.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Sahifadan chiqilsa interval osilib qolmasin.
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    timerRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling();
        setHolat("xato");
        return;
      }

      try {
        const response = await fetch("/api/auth/telegram/holat", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = (await response.json()) as StatusResponse;
        if (data.holat === "tayyor" && data.manzil) {
          stopPolling();
          // `assign` emas, `replace`: orqaga qaytishda kirish sahifasi
          // tarixda qolib ketmasin.
          window.location.replace(data.manzil);
          return;
        }
        if (data.holat === "yaroqsiz") {
          stopPolling();
          setHolat("xato");
        }
      } catch {
        // Tarmoq uzilishi — keyingi urinishda qayta so'raladi.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const boshla = useCallback(async () => {
    setHolat("ochilmoqda");
    try {
      const response = await fetch("/api/auth/telegram/boshlash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) {
        setHolat("xato");
        return;
      }

      const { deepLink: link } = (await response.json()) as { deepLink: string };
      setDeepLink(link);
      setHolat("kutilmoqda");
      startPolling();

      // Yangi ilova/ilova oynasida ochiladi — kirish sahifasi brauzerda
      // ochiq qoladi, aks holda holat so'rovi to'xtardi.
      window.open(link, "_blank", "noopener,noreferrer");
    } catch {
      setHolat("xato");
    }
  }, [locale, startPolling]);

  if (holat === "kutilmoqda" && deepLink) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          {labels.waiting}
        </p>
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {labels.openAgain}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={boshla} disabled={holat === "ochilmoqda"} size="lg">
        {holat === "ochilmoqda" ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Send className="size-4" strokeWidth={1.5} />
        )}
        {labels.start}
      </Button>
      {holat === "xato" && (
        <p role="alert" className="text-sm text-ink-2">
          {labels.error}
        </p>
      )}
    </div>
  );
}
