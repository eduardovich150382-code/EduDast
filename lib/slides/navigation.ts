/**
 * Pleyer navigatsiyasining SOF mantiqi.
 *
 * Komponentda faqat `scrollIntoView` va tinglovchilar qoladi; qaysi tugma
 * qayerga olib borishi va barmoq surishi harakat hisoblanishi shu yerda —
 * ya'ni testlanadi (React muhiti yo'q, `lib/slides/deck.ts` izohiga qarang).
 */

/** Klaviatura yoki barmoq natijasi. */
export type Move = "next" | "prev" | "first" | "last" | "exit";

/** Indeksni mavjud slaydlar chegarasiga tortadi. Bo'sh taqdimotda 0. */
export function clampIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** Keyingi slayd. Oxirgisida JOYIDA QOLADI — aylanib ketmaydi. */
export function nextIndex(index: number, total: number): number {
  return clampIndex(clampIndex(index, total) + 1, total);
}

/** Oldingi slayd. Birinchisida joyida qoladi. */
export function prevIndex(index: number, total: number): number {
  return clampIndex(clampIndex(index, total) - 1, total);
}

/** `Move` ni yangi indeksga aylantiradi. `"exit"` indeksga tegmaydi. */
export function applyMove(move: Move, index: number, total: number): number {
  switch (move) {
    case "next":
      return nextIndex(index, total);
    case "prev":
      return prevIndex(index, total);
    case "first":
      return clampIndex(0, total);
    case "last":
      return clampIndex(total - 1, total);
    case "exit":
      return clampIndex(index, total);
  }
}

/**
 * `KeyboardEvent.key` -> harakat, yoki `null` (ushlanmaydi).
 *
 * `Esc` FAQAT to'liq ekrandan chiqaradi va sahifadan HECH QACHON ketmaydi:
 * dars o'rtasida taqdimotni yo'qotish qotib qolgan to'liq ekrandan ancha
 * yomon.
 *
 * MUHIM — chaqiruvchi `null` DAN BOSHQA natijada `event.preventDefault()`
 * qilishi SHART. `overflow-x-auto` konteyner fokusda bo'lsa brauzerning
 * o'zi ham `←`/`→`/`PageUp`/`PageDown`/`Home`/`End`/`Space` bilan suradi;
 * biz `window` darajasida ushlab dasturiy ravishda ham suramiz, natijada
 * bitta bosishda IKKI slayd o'tib ketardi yoki surilish qaltirardi.
 */
export function keyToMove(key: string): Move | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
    case "Spacebar": // eski Edge/Firefox
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "exit";
    default:
      return null;
  }
}

/**
 * Barmoq surishining eng kichik masofasi (piksel).
 *
 * 48 — tasodifiy tegish bilan ataylab surishni ajratadigan chegara; smart
 * doskada barmoq keng tegadi va 20-30 px siljish bosish paytida ham bo'ladi.
 */
export const SWIPE_MIN_PX = 48;

/**
 * Eng uzun davomiylik (millisekund).
 *
 * Sekin harakat — surish emas, ushlab turish (o'qituvchi slaydni
 * ko'rsatayotgan bo'lishi mumkin).
 */
export const SWIPE_MAX_MS = 600;

/**
 * Barmoq harakatini qadamga aylantiradi: `1` keyingi, `-1` oldingi, `0` yo'q.
 *
 * FAQAT NOTIQ KO'RINISHIDA ishlatiladi. Asosiy pleyerda surish NATIV:
 * `scroll-snap-type: x mandatory` brauzerning o'zi bilan ishlaydi, ya'ni
 * touch handler ham, paket ham kerak emas. Notiq ko'rinishida esa snap
 * konteyner yo'q (joriy slayd, izoh va keyingi slayd bir ekranda), shuning
 * uchun u yerda surishni o'zimiz hisoblaymiz.
 *
 * Vertikal siljish gorizontaldan katta bo'lsa — bu sahifani aylantirish,
 * slayd almashtirish emas.
 */
export function swipeStep(gesture: { dx: number; dy: number; ms: number }): -1 | 0 | 1 {
  const { dx, dy, ms } = gesture;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(ms)) return 0;
  if (ms > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dy) >= Math.abs(dx)) return 0;
  // Chapga surish (`dx < 0`) KEYINGI slaydni keltiradi — qog'oz varaqlash
  // bilan bir xil yo'nalish, va `dir="ltr"` da nativ snap ham shunday.
  return dx < 0 ? 1 : -1;
}
