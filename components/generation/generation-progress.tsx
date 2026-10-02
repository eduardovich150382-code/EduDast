"use client";

import { Check, Circle, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Generatsiya konveyerini HAYDAYDIGAN komponent va KO'RINADIGAN bosqich
 * ro'yxati (11-sessiya; `stage-runner.tsx` ning o'rniga).
 *
 * SOXTA PROGRESS BAR YO'Q (hujjatning 2-bandi). O'rniga haqiqiy bosqich
 * ro'yxati: har bosqich nomi, tugagani ✓, joriysi aylanuvchi, qolgani ○.
 * Qatorlar serverdan keladi, chunki nomlar `inputParams` dan hisoblanadi
 * (`lib/generation/stage-labels.ts`).
 *
 * NEGA POST HALQASI, `holat` SO'ROVI EMAS: `POST /bosqich` konveyerni
 * HAYDAYDI — alohida worker yo'q. `GET /holat` ni so'rab turish hech qachon
 * oldinga ketmaydigan hujjatni kuzatardi. Har muvaffaqiyatdan keyin
 * `router.refresh()` chaqiriladi va server komponent yangi bloklarni
 * ko'rsatadi — hujjat talab qilgan "bloklar darhol ekranga chiqsin" aynan
 * shu bilan bajariladi.
 *
 * Bosqich raqami SERVERDA (`inputParams.progress`), shuning uchun brauzer
 * yopilib qayta ochilsa ham o'sha joydan davom etadi: bu komponent
 * shunchaki `POST` qilaveradi, kursorni server biladi.
 *
 * NEGA `useTranslations`: bu komponent `NextIntlClientProvider` ichida
 * (`app/[locale]/layout.tsx`), ya'ni tarjimalarni prop sifatida uzatish
 * shart emas. Funksiya prop uzatish esa TAQIQLANGAN
 * (`tests/client-props-guard.test.ts`).
 */

type Props = {
  documentId: string;
  /** Serverdan kelgan boshlang'ich kursor. */
  stage: number;
  total: number;
  /** Bosqich nomlari — tartibda, `total` ta. Bo'sh bo'lsa nomsiz qatorlar. */
  stageNames: string[];
  /**
   * Yiqilganda "Qaytadan yaratish" havolasining query'si — sehrgarni
   * TO'LDIRILGAN holda ochadi (`wizardQueryFromDocument`).
   */
  retryQuery: Record<string, string>;
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

/** 503 javobida `retryAfterSeconds` kelmasa ishlatiladigan qiymat. */
const DEFAULT_RETRY_SECONDS = 90;

type Phase = "idle" | "running" | "waiting" | "stopped";

export function GenerationProgress({
  documentId,
  stage,
  total,
  stageNames,
  retryQuery,
}: Props) {
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
  // `AbortController` (hujjatning 2-bandi talabi). Usiz sahifadan
  // chiqilganda ~60 soniyalik POST tugamaguncha ulanish band turardi, 503
  // sanoqchisi esa 90 soniya mavjud bo'lmagan daraxtga `setCountdown`
  // chaqirardi.
  const abortRef = useRef<AbortController | null>(null);

  const drive = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      for (;;) {
        if (cancelledRef.current) return;

        if (attemptsRef.current >= MAX_CLIENT_ATTEMPTS) {
          setPhase("stopped");
          toast.error(t("giveUp"));
          return;
        }

        setPhase("running");

        const controller = new AbortController();
        abortRef.current = controller;

        let response: Response;
        try {
          response = await fetch(`/api/generate/${documentId}/bosqich`, {
            method: "POST",
            signal: controller.signal,
          });
        } catch {
          // Abort — sahifadan chiqildi, jim to'xtaymiz.
          if (cancelledRef.current) return;
          // Tarmoq xatosi: oldin bu tarmoq UMUMAN YO'Q edi va otilgan
          // `fetch` halqadan chiqib ketardi; `finally` `runningRef` ni
          // tiklagani uchun konveyer qo'lda yangilashgacha jimgina
          // o'lardi. Endi u oddiy urinish sifatida hisoblanadi.
          attemptsRef.current += 1;
          await abortableSleep(BUSY_PAUSE_MS, cancelledRef);
          continue;
        }

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
          await abortableSleep(BUSY_PAUSE_MS, cancelledRef);
          continue;
        }

        if (response.status === 503) {
          attemptsRef.current += 1;
          const seconds = data.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS;
          setPhase("waiting");
          // Toast HAR KUTISH uchun bir marta — sanoqning har tikida emas,
          // aks holda 90 ta toast chiqardi.
          toast.warning(t("waiting", { seconds }));
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
          toast.success(t("done"));
          return;
        }

        if (typeof data.stage === "number") setCurrent(data.stage);
      }
    } finally {
      runningRef.current = false;
    }
  }, [documentId, router, t]);

  useEffect(() => {
    cancelledRef.current = false;
    void drive();
    return () => {
      // Sahifadan chiqilsa tsikl to'xtaydi va uchib turgan so'rov bekor
      // qilinadi. Serverdagi bosqich davom etaveradi — u allaqachon
      // egallangan va commit qiladi.
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, [drive]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-3 py-3">
      <ol className="flex flex-col gap-1.5" aria-live="polite">
        {Array.from({ length: total }, (_, index) => {
          const done = index < current;
          const isCurrent = index === current && phase !== "stopped";
          const name = stageNames[index];

          return (
            <li
              key={index}
              className="flex items-center gap-2 text-sm"
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Ikonka yolg'iz o'zi kirish imkoniyatini bermaydi —
                  shuning uchun har qatorda ekran o'qigichi uchun holat
                  so'zi ham bor. */}
              {done ? (
                <Check className="size-4 shrink-0 text-accent-2" strokeWidth={1.5} aria-hidden />
              ) : isCurrent ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-accent"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : (
                <Circle className="size-4 shrink-0 text-ink-2" strokeWidth={1.5} aria-hidden />
              )}

              <span className={cn(done ? "text-ink-2" : "text-ink")}>
                {name ?? t("stageLabel", { stage: index + 1, total })}
              </span>

              <span className="sr-only">
                {done
                  ? t("stageDone")
                  : isCurrent
                    ? t("stageCurrent")
                    : t("stagePending")}
              </span>
            </li>
          );
        })}
      </ol>

      {phase === "waiting" && (
        <p className="text-xs text-ink-2" aria-live="polite">
          {t("waiting", { seconds: countdown })}
        </p>
      )}

      {phase === "stopped" && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm text-ink">{t("giveUp")}</p>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="self-start"
            onClick={() => {
              // Sehrgarni TO'LDIRILGAN holda ochadi: tur, mavzu va
              // parametrlar saqlanadi, ya'ni bitta bosishda qayta
              // yuriladi. Yangi server action YO'Q — kredit allaqachon
              // qaytarilgan, demak qayta navbatga qo'yish amali oddiy
              // yaratish oqimining aynan o'zini qilardi va ikkinchi
              // kredit-hold yo'lini yasardi.
              router.push(`/ish/yarat?${new URLSearchParams(retryQuery).toString()}`);
            }}
          >
            <RefreshCw className="size-4" strokeWidth={1.5} />
            {t("retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Bekor qilinadigan kutish.
 *
 * Oddiy `setTimeout` bilan 90 soniyalik kutish sahifadan chiqilgandan keyin
 * ham oxirigacha ishlardi; bu versiya har 250 ms da bekor qilinganini
 * tekshiradi, ya'ni unmount'da deyarli darhol tarqaydi.
 */
function abortableSleep(ms: number, cancelled: { current: boolean }): Promise<void> {
  const TICK = 250;
  return new Promise((resolve) => {
    let left = ms;
    const timer = setInterval(() => {
      if (cancelled.current || left <= 0) {
        clearInterval(timer);
        resolve();
        return;
      }
      left -= TICK;
    }, TICK);
  });
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
    await abortableSleep(1_000, cancelled);
  }
}
