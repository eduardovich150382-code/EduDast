/**
 * Avtosaqlash debounce'i — sof modul, React'siz (13-sessiya, 3-band).
 *
 * NEGA HOOK ICHIDA EMAS: repoda React test muhiti yo'q (`vitest` `node`
 * muhitida ishlaydi, `@testing-library/react` va `jsdom` o'rnatilmagan), va
 * ikki paketni faqat shu uchun qo'shish CLAUDE.md ning "sababsiz paket
 * qo'shma" qoidasiga tegadi. Shuning uchun debounce shu yerda —
 * `tests/documents-autosave.test.ts` uni soxta taymerlar bilan to'liq
 * qadaydi, hook esa ustidagi yupqa qobiq bo'lib qoladi.
 *
 * `cancelTimer()` KUTIB TURGAN ISHNI SAQLAB QOLADI, faqat taymerni
 * o'chiradi. Bu ataylab: React effekt tozalagichlari E'LON TARTIBIDA
 * ishlaydi, ya'ni komponent yo'qolganda "debounce tozalagichi" bilan
 * "oxirgi marta saqla" tozalagichining qaysi biri birinchi ishlashi
 * e'lon tartibiga bog'lanib qolardi. Kutib turgan ish saqlanib qolsa
 * tartib AHAMIYATSIZ bo'ladi — `flushPending()` uni qaysi payt chaqirilsa
 * ham bajaradi.
 */
export type Debouncer = {
  /** Oldingi kutishni almashtiradi — ketma-ket chaqiruvlar BITTA ishga yig'iladi. */
  schedule: (run: () => void) => void;
  /** Taymerni o'chiradi, kutib turgan ishni SAQLAB QOLADI. */
  cancelTimer: () => void;
  /** Kutib turgan ish bo'lsa darhol bajaradi. */
  flushPending: () => void;
};

export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  function cancelTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function flushPending(): void {
    const run = pending;
    if (run === null) return;
    // Avval tozalanadi, keyin chaqiriladi: `run` ichida xato bo'lsa ham
    // ayni ish ikkinchi marta bajarilmasin.
    pending = null;
    cancelTimer();
    run();
  }

  return {
    schedule(run) {
      cancelTimer();
      pending = run;
      timer = setTimeout(flushPending, delayMs);
    },
    cancelTimer,
    flushPending,
  };
}

/** Avtosaqlash kutish vaqti — sessiya hujjatining 3-bandi. */
export const AUTOSAVE_MS = 1_500;
