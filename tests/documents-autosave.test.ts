import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_MS, createDebouncer } from "@/lib/documents/autosave";

/**
 * Avtosaqlash debounce'i (docs/sessions/13-muharrir.md, 3-band).
 *
 * MARKAZIY DA'VO: ketma-ket o'zgarishlar BITTA saqlashga yig'iladi. Agar
 * debounce buzilsa, har bosilgan harf serverga so'rov yuborardi va buni
 * faqat qo'lda, Network panelini kuzatib sezish mumkin bo'lardi — ya'ni
 * jimgina regressiya. Shuning uchun xossa testga qotirilgan.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncer", () => {
  it("5 ta ketma-ket o'zgarish BITTA chaqiruv beradi", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    for (const value of [1, 2, 3, 4, 5]) {
      debouncer.schedule(() => {
        run(value);
      });
      // Har o'zgarish orasida kutish vaqtidan KAM vaqt o'tadi.
      vi.advanceTimersByTime(300);
    }
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    // Oxirgi qiymat ketadi, birinchisi emas.
    expect(run).toHaveBeenCalledWith(5);
  });

  it("jim turgandan keyin bir marta chaqiradi", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    debouncer.schedule(run);
    vi.advanceTimersByTime(AUTOSAVE_MS - 1);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);

    // Taymer o'tganidan keyin qayta chaqirilmaydi.
    vi.advanceTimersByTime(AUTOSAVE_MS * 5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancelTimer taymerni o'chiradi, lekin ishni SAQLAB QOLADI", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    debouncer.schedule(run);
    debouncer.cancelTimer();
    vi.advanceTimersByTime(AUTOSAVE_MS * 5);
    expect(run).not.toHaveBeenCalled();

    // Ish yo'qolmagan: React effekt tozalagichlarining tartibi
    // ahamiyatsiz bo'lishi uchun shunday.
    debouncer.flushPending();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flushPending kutib turgan ishni darhol bajaradi", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    debouncer.schedule(run);
    debouncer.flushPending();
    expect(run).toHaveBeenCalledTimes(1);

    // Taymer ham o'chgan — ikkinchi chaqiruv bo'lmaydi.
    vi.advanceTimersByTime(AUTOSAVE_MS * 5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flushPending ikki marta chaqirilsa ish BIR marta bajariladi", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    debouncer.schedule(run);
    debouncer.flushPending();
    debouncer.flushPending();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("kutib turgan ish bo'lmasa flushPending jim qaytadi", () => {
    const debouncer = createDebouncer(AUTOSAVE_MS);
    expect(() => {
      debouncer.flushPending();
    }).not.toThrow();
  });

  it("flush dan keyingi schedule yangi kutishni boshlaydi", () => {
    const run = vi.fn();
    const debouncer = createDebouncer(AUTOSAVE_MS);

    debouncer.schedule(() => {
      run("birinchi");
    });
    debouncer.flushPending();
    debouncer.schedule(() => {
      run("ikkinchi");
    });
    vi.advanceTimersByTime(AUTOSAVE_MS);

    expect(run.mock.calls.map((call) => call[0])).toEqual(["birinchi", "ikkinchi"]);
  });

  it("kutish vaqti 1.5 soniya", () => {
    expect(AUTOSAVE_MS).toBe(1_500);
  });
});
