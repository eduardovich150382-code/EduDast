"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlayerControls } from "@/components/slides/player-controls";
import { applyMove, clampIndex, keyToMove } from "@/lib/slides/navigation";

/**
 * O'zgarmaydigan qiymat uchun bo'sh obuna.
 *
 * Modul darajasida — har render'da yangi funksiya yasalsa
 * `useSyncExternalStore` qayta obuna bo'lib turardi.
 */
const SUBSCRIBE_NEVER = () => () => undefined;

/**
 * Pleyer qobig'i — YAGONA klient chegarasi.
 *
 * Slaydlar `children` sifatida SERVERDAN keladi (`SlideDeck`), bu qobiq esa
 * faqat uchta ishni qiladi: klaviatura, to'liq ekran va joriy slayd
 * indeksini kuzatish. Surishning o'zi NATIV — `scroll-snap-type: x mandatory`
 * (`styles/slides.css`), ya'ni barmoq bilan surish uchun touch handler ham,
 * paket ham kerak emas.
 *
 * INTERNETGA BOG'LIQ EMAS: bu komponent hech qanday `fetch`, `router.refresh`
 * yoki polling qilmaydi. Sahifa ochilgandan keyin tarmoq uzilsa taqdimot
 * to'liq ishlashda davom etadi. KEYINGI SESSIYA UCHUN: bu yerga so'rov
 * qo'shish qabul mezonini buzadi.
 *
 * Props faqat satr va son — funksiya prop yo'q
 * (`tests/client-props-guard.test.ts`).
 */
export function SlidePlayer({
  total,
  labels,
  printHref,
  notesHref,
  backHref,
  presenterHref,
  children,
}: {
  total: number;
  labels: {
    prev: string;
    next: string;
    fullscreen: string;
    fullscreenExit: string;
    print: string;
    notesShow: string;
    notesHide: string;
    notesOn: boolean;
    presenter: string;
    back: string;
    deckHint: string;
  };
  printHref: string;
  notesHref: string;
  backHref: string;
  presenterHref: string;
  children: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const deckRef = useRef<HTMLDivElement | null>(null);

  /**
   * Brauzerda Fullscreen API bormi.
   *
   * `useSyncExternalStore`, `useEffect` + `setState` EMAS: qiymat serverda
   * (`false`) va mijozda boshqacha, bu esa shartli render'da hidratsiya
   * nomuvofiqligi berardi. Bu hook aynan shu holat uchun — serverdagi
   * snapshot bilan render qiladi, keyin mijoz qiymati bilan qayta render
   * qiladi, kaskad effekt ham, lint ogohlantirishi ham yo'q.
   *
   * Nega umuman tekshiriladi: iPhone Safari'da `requestFullscreen` YO'Q va
   * hech narsa qilmaydigan tugma ko'rsatish o'qituvchini chalkashtirardi
   * (dars o'rtasida "ishlamayapti" deb qayta-qayta bosardi).
   */
  const canFullscreen = useSyncExternalStore(
    SUBSCRIBE_NEVER,
    () => typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );

  /** Berilgan indeksli freymga suradi. Snap konteyner o'zi joyiga qo'yadi. */
  const scrollTo = useCallback(
    (target: number) => {
      const deck = deckRef.current?.querySelector<HTMLElement>("#slide-deck");
      const frame = deck?.children[target];
      if (frame instanceof HTMLElement) {
        frame.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    },
    [],
  );

  /**
   * Harakatni qo'llaydi: indeksni yangilab, freymga suradi.
   *
   * `setIndex` ichida surish — joriy indeks state'dan o'qiladi, ya'ni
   * tinglovchi eski qiymatni ushlab qolmaydi (klaviatura effekti bir marta
   * o'rnatiladi va `index` ga bog'lanmaydi).
   */
  const move = useCallback(
    (direction: "next" | "prev") => {
      setIndex((current) => {
        const next = applyMove(direction, current, total);
        scrollTo(next);
        return next;
      });
    },
    [total, scrollTo],
  );

  // --- Klaviatura ---
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // Maydonda yozayotgan odamning tugmasini o'g'irlamaymiz. Pleyerda
      // input yo'q, lekin brauzer kengaytmalari qo'shishi mumkin.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const move = keyToMove(event.key);
      if (move === null) return;

      // `preventDefault()` USHLANGAN HAR TUGMAGA, faqat `Space` ga emas:
      // `overflow-x-auto` konteyner fokusda bo'lsa brauzerning O'ZI ham
      // o'q va `PageUp`/`PageDown`/`Home`/`End` bilan suradi. Biz pastda
      // dasturiy ravishda ham suramiz, natijada bitta bosishda IKKI slayd
      // o'tib ketardi yoki surilish qaltirardi.
      event.preventDefault();

      if (move === "exit") {
        // `Esc` FAQAT to'liq ekrandan chiqaradi va sahifadan HECH QACHON
        // ketmaydi: dars o'rtasida taqdimotni yo'qotish qotib qolgan
        // to'liq ekrandan yomonroq.
        if (document.fullscreenElement !== null) void document.exitFullscreen();
        return;
      }

      setIndex((current) => {
        const next = applyMove(move, current, total);
        scrollTo(next);
        return next;
      });
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [total, scrollTo]);

  // --- Joriy slayd indeksi ---
  useEffect(() => {
    const deck = deckRef.current?.querySelector<HTMLElement>("#slide-deck");
    if (!deck) return;

    // `IntersectionObserver`, scroll hodisasi arifmetikasi EMAS: snap
    // konteynerda piksel hisobi skrollbar kengligi va `padding` ga bog'liq
    // bo'lib, chetki slaydlarda bir xato beradi.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = entry.target.getAttribute("data-slide-index");
          if (raw === null) continue;
          setIndex(clampIndex(Number(raw), total));
        }
      },
      { root: deck, threshold: 0.6 },
    );

    for (const frame of deck.children) observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, [total]);

  // --- To'liq ekran holati ---
  useEffect(() => {
    function handleChange() {
      setFullscreen(document.fullscreenElement !== null);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
    };
  }, []);

  return (
    <div ref={deckRef} className="relative">
      {children}

      {/* `onMove` — KLIENT->KLIENT funksiya prop, bu ruxsat etilgan:
          `tests/client-props-guard.test.ts` faqat server->klient chegarasini
          tekshiradi (`components/editor/blocks/props.ts` dagi ayni holat). */}
      <PlayerControls
        index={index}
        total={total}
        fullscreen={fullscreen}
        canFullscreen={canFullscreen}
        labels={labels}
        printHref={printHref}
        notesHref={notesHref}
        backHref={backHref}
        presenterHref={presenterHref}
        onMove={move}
      />
    </div>
  );
}
