import { describe, expect, it } from "vitest";
import {
  FILLER_ALPHABET,
  GRID_WORD_MAX,
  MIN_WORD_LENGTH,
  normalizeWord,
  WORD_ALPHABET,
} from "@/lib/games/alphabet";

/**
 * `normalizeWord` ning eng xavfli tomoni — JIMGINA yo'qotish.
 *
 * Yaroqsiz so'z `null` qaytaradi va chaqiruvchi uni tashlab ketadi. Agar
 * alifbo noto'g'ri bo'lsa (masalan `C` tushib qolsa), `ch` li barcha
 * so'zlar shu yo'l bilan yo'qolardi va hech bir test yiqilmasdi — chunki
 * "yaroqsiz so'z tashlanadi" qoidasi buni normal hol deb biladi. Shuning
 * uchun eng chastotali digraflar ALOHIDA qadalgan.
 */

describe("normalizeWord — o'zbek digraflari", () => {
  it.each([
    ["chiziq", "CHIZIQ"],
    ["uchburchak", "UCHBURCHAK"],
    ["kuch", "KUCH"],
    ["shamol", "SHAMOL"],
    ["o'quvchi", "OQUVCHI"],
    ["g'isht", "GISHT"],
    ["ng", null], // ikki harf — MIN_WORD_LENGTH dan qisqa
  ])("%s -> %s", (input, expected) => {
    expect(normalizeWord(input, GRID_WORD_MAX)).toBe(expected);
  });

  it("ch li so'zlar yo'qolmaydi", () => {
    const words = ["chiziq", "uchburchak", "kuch", "o'quvchi", "chap", "ochiq"];
    for (const word of words) {
      expect(normalizeWord(word, GRID_WORD_MAX), `"${word}" tashlab ketildi`).not.toBeNull();
    }
  });
});

describe("normalizeWord — apostrof", () => {
  it.each(["o'zbek", "oʻzbek", "o’zbek", "oʼzbek"])(
    "%s uchun apostrof shakli ahamiyatsiz",
    (input) => {
      expect(normalizeWord(input, GRID_WORD_MAX)).toBe("OZBEK");
    },
  );
});

describe("normalizeWord — rad etiladigan kirish", () => {
  it.each([
    ["window", "lotin `w` o'zbek alifbosida yo'q"],
    ["test 1", "raqam va bo'sh joy"],
    ["ko'k-sariq", "chiziqcha"],
    ["ПАР", "kirill"],
    ["aa", "juda qisqa"],
    ["aaa", "bitta xil harf"],
    ["AAAA", "bitta xil harf"],
    ["", "bo'sh satr"],
    ["abracadabraa", "juda uzun"],
  ])("%s rad etiladi (%s)", (input) => {
    expect(normalizeWord(input, GRID_WORD_MAX)).toBeNull();
  });

  it("uzunlik chegaralari aynan ishlaydi", () => {
    // `AB` + takrorlanmaydigan harflar bilan aynan chegaraga teng so'z.
    const atMin = "ABC".slice(0, MIN_WORD_LENGTH);
    const atMax = "ABCDEFGHIJ".slice(0, GRID_WORD_MAX);
    expect(normalizeWord(atMin, GRID_WORD_MAX)).toBe(atMin);
    expect(normalizeWord(atMax, GRID_WORD_MAX)).toBe(atMax);
    expect(normalizeWord(`${atMax}K`, GRID_WORD_MAX)).toBeNull();
  });

  it("natija idempotent", () => {
    const once = normalizeWord("o'quvchi", GRID_WORD_MAX);
    expect(once).not.toBeNull();
    expect(normalizeWord(once!, GRID_WORD_MAX)).toBe(once);
  });
});

describe("alifbolar", () => {
  it("so'z alifbosida C bor, W yo'q", () => {
    expect(WORD_ALPHABET).toContain("C");
    expect(WORD_ALPHABET).not.toContain("W");
  });

  it("to'ldirish alifbosida yolg'iz C yo'q", () => {
    expect(FILLER_ALPHABET).not.toContain("C");
    expect(FILLER_ALPHABET).not.toContain("W");
  });

  it("to'ldirish alifbosi so'z alifbosining qismi", () => {
    for (const letter of FILLER_ALPHABET) {
      expect(WORD_ALPHABET).toContain(letter);
    }
  });

  it("alifbolarda takrorlanish yo'q", () => {
    expect(new Set(WORD_ALPHABET).size).toBe(WORD_ALPHABET.length);
    expect(new Set(FILLER_ALPHABET).size).toBe(FILLER_ALPHABET.length);
  });
});
