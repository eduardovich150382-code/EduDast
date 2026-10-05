import { describe, expect, it } from "vitest";
import {
  applyMove,
  clampIndex,
  keyToMove,
  nextIndex,
  prevIndex,
  swipeStep,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
} from "@/lib/slides/navigation";

/**
 * Pleyer navigatsiyasi.
 *
 * React muhiti yo'q (jsdom ham, RTL ham), shuning uchun komponent
 * testlanmaydi — butun mantiq shu sof modulda va qoplama shu yerda.
 * Eng muhim da'vosi: `keyToMove` ushlaydigan HAR tugma ro'yxatda bor,
 * chunki chaqiruvchi aynan shu ro'yxat bo'yicha `preventDefault()` qiladi.
 */

describe("clampIndex", () => {
  it("chegaraga tortadi", () => {
    expect(clampIndex(-5, 12)).toBe(0);
    expect(clampIndex(0, 12)).toBe(0);
    expect(clampIndex(11, 12)).toBe(11);
    expect(clampIndex(99, 12)).toBe(11);
  });

  it("bo'sh taqdimotda va buzuq sonda 0 qaytaradi", () => {
    // Indeks `IntersectionObserver` dan keladi — slayd o'chirilsa u bir
    // render orqada qolishi mumkin, shuning uchun throw qilmaydi.
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(0, -1)).toBe(0);
    expect(clampIndex(Number.NaN, 12)).toBe(0);
    expect(clampIndex(Number.POSITIVE_INFINITY, 12)).toBe(0);
    expect(clampIndex(2.7, 12)).toBe(2);
  });
});

describe("nextIndex / prevIndex", () => {
  it("bir qadam yuradi", () => {
    expect(nextIndex(0, 12)).toBe(1);
    expect(prevIndex(5, 12)).toBe(4);
  });

  it("chegarada JOYIDA QOLADI — aylanib ketmaydi", () => {
    // Aylanish dars o'rtasida chalkashtiradi: oxirgi slaydda "keyingi"
    // bosilganda boshiga qaytish o'qituvchini yo'qotardi.
    expect(nextIndex(11, 12)).toBe(11);
    expect(prevIndex(0, 12)).toBe(0);
  });
});

describe("applyMove", () => {
  it.each([
    ["next", 3, 4],
    ["prev", 3, 2],
    ["first", 3, 0],
    ["last", 3, 11],
    ["exit", 3, 3],
  ] as const)("%s: %i -> %i", (move, from, to) => {
    expect(applyMove(move, from, 12)).toBe(to);
  });

  it("exit indeksga TEGMAYDI — faqat to'liq ekrandan chiqaradi", () => {
    expect(applyMove("exit", 7, 12)).toBe(7);
  });
});

describe("keyToMove", () => {
  it.each([
    ["ArrowRight", "next"],
    ["ArrowDown", "next"],
    ["PageDown", "next"],
    [" ", "next"],
    ["Spacebar", "next"],
    ["ArrowLeft", "prev"],
    ["ArrowUp", "prev"],
    ["PageUp", "prev"],
    ["Home", "first"],
    ["End", "last"],
    ["Escape", "exit"],
  ] as const)("%s -> %s", (key, move) => {
    expect(keyToMove(key)).toBe(move);
  });

  it.each(["a", "Enter", "Tab", "F5", "Shift", "", "arrowright"])(
    "%s ushlanmaydi",
    (key) => {
      expect(keyToMove(key)).toBeNull();
    },
  );

  it("BRAUZER O'ZI suradigan har tugma ushlanadi", () => {
    // Bu test `preventDefault()` ni kafolatlaydi: ro'yxatdan tushib qolgan
    // tugma brauzerning nativ surilishi bilan BIZNING surilishimizni
    // qo'shib, bitta bosishda ikki slayd o'tishiga olib keladi.
    const browserScrolls = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
    ];
    for (const key of browserScrolls) {
      expect(keyToMove(key), key).not.toBeNull();
    }
  });
});

describe("swipeStep", () => {
  it("chapga surish keyingi, o'ngga surish oldingi slayd", () => {
    // Qog'oz varaqlash yo'nalishi: chapga surish oldinga olib boradi.
    expect(swipeStep({ dx: -120, dy: 4, ms: 200 })).toBe(1);
    expect(swipeStep({ dx: 120, dy: 4, ms: 200 })).toBe(-1);
  });

  it("qisqa siljish harakat hisoblanmaydi", () => {
    // Smart doskada barmoq keng tegadi — bosish paytidagi 20-30 px
    // siljish slaydni almashtirmasligi kerak.
    expect(swipeStep({ dx: -(SWIPE_MIN_PX - 1), dy: 0, ms: 200 })).toBe(0);
    expect(swipeStep({ dx: 0, dy: 0, ms: 200 })).toBe(0);
  });

  it("chegaradagi masofa harakat hisoblanadi", () => {
    expect(swipeStep({ dx: -SWIPE_MIN_PX, dy: 0, ms: 200 })).toBe(1);
  });

  it("vertikal siljish gorizontaldan katta bo'lsa — sahifani aylantirish", () => {
    expect(swipeStep({ dx: -60, dy: 90, ms: 200 })).toBe(0);
    // Teng bo'lsa ham harakat emas: yo'nalish aniq emas.
    expect(swipeStep({ dx: -60, dy: 60, ms: 200 })).toBe(0);
  });

  it("sekin harakat ushlab turish — surish emas", () => {
    expect(swipeStep({ dx: -200, dy: 0, ms: SWIPE_MAX_MS + 1 })).toBe(0);
    expect(swipeStep({ dx: -200, dy: 0, ms: SWIPE_MAX_MS })).toBe(1);
  });

  it("buzuq son 0 qaytaradi, throw QILMAYDI", () => {
    expect(swipeStep({ dx: Number.NaN, dy: 0, ms: 100 })).toBe(0);
    expect(swipeStep({ dx: -100, dy: Number.NaN, ms: 100 })).toBe(0);
    expect(swipeStep({ dx: -100, dy: 0, ms: Number.NaN })).toBe(0);
  });
});
