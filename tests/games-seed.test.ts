import { describe, expect, it } from "vitest";
import { gameSeed, mulberry32, randomInt, shuffle } from "@/lib/games/seed";

describe("gameSeed", () => {
  it("bir kirish -> bir urug'", () => {
    expect(gameSeed("doc-1", 0)).toBe(gameSeed("doc-1", 0));
  });

  it("boshqa variant -> boshqa urug'", () => {
    const base = gameSeed("doc-1", 0);
    expect(gameSeed("doc-1", 1)).not.toBe(base);
    expect(gameSeed("doc-1", 2)).not.toBe(base);
    expect(gameSeed("doc-1", 1)).not.toBe(gameSeed("doc-1", 2));
  });

  it("boshqa hujjat -> boshqa urug'", () => {
    expect(gameSeed("doc-1", 0)).not.toBe(gameSeed("doc-2", 0));
  });

  it("natija manfiy bo'lmagan butun son", () => {
    // Blokdagi `seed` sxemasi `int().min(0)` — manfiy son `contentJson` ga
    // tushib parse'ni yiqitardi.
    for (const id of ["a", "doc-xyz", "c".repeat(64), ""]) {
      for (const variant of [0, 1, 7, 99]) {
        const seed = gameSeed(id, variant);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });

  it("qo'shni variantlar urug'i yaqin EMAS", () => {
    // `seed + variant` naqshi qo'shni variantlarga qo'shni urug' berardi va
    // `mulberry32` ning birinchi qadamlari o'xshab, 1 va 2-variant
    // panjaralari bir-biriga o'xshab qolardi.
    const a = gameSeed("doc-1", 1);
    const b = gameSeed("doc-1", 2);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe("mulberry32", () => {
  it("bir urug' -> bir ketma-ketlik", () => {
    const take = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 20 }, () => rng());
    };
    expect(take(42)).toEqual(take(42));
    expect(take(42)).not.toEqual(take(43));
  });

  it("natija [0, 1) oralig'ida", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("taqsimot qo'pol darajada tekis", () => {
    const rng = mulberry32(123);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i += 1) {
      buckets[Math.floor(rng() * 4)]! += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(8_000);
      expect(count).toBeLessThan(12_000);
    }
  });
});

describe("randomInt", () => {
  it("[0, max) chegarasidan chiqmaydi", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 2_000; i += 1) {
      const value = randomInt(rng, 8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(8);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("shuffle", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("kirishni o'zgartirmaydi", () => {
    const input = [...items];
    shuffle(mulberry32(1), input);
    expect(input).toEqual(items);
  });

  it("hamma elementni saqlaydi", () => {
    const out = shuffle(mulberry32(9), items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("deterministik", () => {
    expect(shuffle(mulberry32(3), items)).toEqual(shuffle(mulberry32(3), items));
  });

  it("boshqa urug' -> boshqa tartib", () => {
    expect(shuffle(mulberry32(3), items)).not.toEqual(shuffle(mulberry32(4), items));
  });

  it("bo'sh va bir elementli massiv bilan ishlaydi", () => {
    expect(shuffle(mulberry32(1), [])).toEqual([]);
    expect(shuffle(mulberry32(1), ["a"])).toEqual(["a"]);
  });
});
