import { describe, expect, it } from "vitest";
import { buildAnagram, scramble } from "@/lib/games/anagram";
import { AnagramContent } from "@/lib/games/content";
import { gameSeed, mulberry32 } from "@/lib/games/seed";

const WORDS = ["CHIZIQ", "KVADRAT", "DOIRA", "BURCHAK", "TOMON", "YUZA"];

const content = (words: string[] = WORDS) =>
  AnagramContent.parse({
    kind: "anagram",
    items: words.map((word) => ({ word, clue: `${word} nimani bildiradi?` })),
  });

const SEED = gameSeed("doc-1", 0);

/** Harflarni multiset sifatida solishtiradi. */
const letters = (value: string | string[]) => [...value].sort().join("");

describe("scramble", () => {
  it("natija asl so'zga TENG EMAS", () => {
    // Bu eng muhim shart: aralashmagan so'z anagramma emas, javobning o'zi.
    for (const word of WORDS) {
      for (let seed = 0; seed < 200; seed += 1) {
        const out = scramble(mulberry32(seed), word).join("");
        expect(out, `${word} urug' ${String(seed)} da aralashmadi`).not.toBe(word);
      }
    }
  });

  it("barcha harflar SAQLANADI", () => {
    for (const word of WORDS) {
      for (let seed = 0; seed < 100; seed += 1) {
        const out = scramble(mulberry32(seed), word);
        expect(out).toHaveLength(word.length);
        expect(letters(out)).toBe(letters(word));
      }
    }
  });

  it("takrorlangan harfli so'zda ham ishlaydi", () => {
    // `ALLA` — ikki xil harf, uchta `A`. Aralashtirish qiyin, lekin
    // mumkin; siklik surish oxirgi chora.
    for (const word of ["ALLA", "AABB", "ABABAB", "AAB"]) {
      for (let seed = 0; seed < 50; seed += 1) {
        const out = scramble(mulberry32(seed), word).join("");
        expect(out, `${word} urug' ${String(seed)}`).not.toBe(word);
        expect(letters(out)).toBe(letters(word));
      }
    }
  });

  it("deterministik", () => {
    expect(scramble(mulberry32(5), "KVADRAT")).toEqual(scramble(mulberry32(5), "KVADRAT"));
  });
});

describe("buildAnagram", () => {
  it("har element uchun aralashma beradi", () => {
    const built = buildAnagram(content(), SEED);
    expect(built.kind).toBe("anagram");
    expect(built.items).toHaveLength(WORDS.length);
    for (const item of built.items) {
      expect(item.scrambled.join("")).not.toBe(item.word);
      expect(letters(item.scrambled)).toBe(letters(item.word));
    }
  });

  it("so'z va ta'rif o'zgarmaydi", () => {
    const built = buildAnagram(content(), SEED);
    expect(built.items.map((item) => item.word)).toEqual(WORDS);
    for (const item of built.items) {
      expect(item.clue).toBe(`${item.word} nimani bildiradi?`);
    }
  });

  it("elementlar MAZMUN tartibida qoladi", () => {
    // Tartib aralashtirilsa varaqdagi ta'riflar bilan javoblar kaliti mos
    // kelmasdi va "3-savol" ikki render'da boshqa savol bo'lardi.
    const built = buildAnagram(content(), SEED);
    expect(built.items.map((item) => item.word)).toEqual(WORDS);
  });

  it("bir urug' -> bir natija", () => {
    expect(buildAnagram(content(), SEED)).toEqual(buildAnagram(content(), SEED));
  });

  it("boshqa urug' -> boshqa aralashma", () => {
    const a = buildAnagram(content(), gameSeed("doc-1", 0));
    const b = buildAnagram(content(), gameSeed("doc-1", 1));
    expect(a.items.map((i) => i.scrambled)).not.toEqual(b.items.map((i) => i.scrambled));
  });

  it("variant 1 va 2 ham farq qiladi", () => {
    const a = buildAnagram(content(), gameSeed("doc-1", 1));
    const b = buildAnagram(content(), gameSeed("doc-1", 2));
    expect(a.items.map((i) => i.scrambled)).not.toEqual(b.items.map((i) => i.scrambled));
  });

  it("kirish mazmuni O'ZGARTIRILMAYDI", () => {
    const parsed = content();
    const before = JSON.stringify(parsed);
    buildAnagram(parsed, SEED);
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it("maksimal yuklamada 200 ms dan tez", () => {
    const parsed = content([...WORDS, "PERIMETR", "RADIUS", "DIAMETR", "ASOS", "QIRRA", "HAJM"]);
    const start = performance.now();
    const runs = 50;
    for (let i = 0; i < runs; i += 1) buildAnagram(parsed, gameSeed("doc-vaqt", i));
    expect((performance.now() - start) / runs).toBeLessThan(200);
  });
});
