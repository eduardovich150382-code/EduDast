import { describe, expect, it } from "vitest";
import { WheelContent } from "@/lib/games/content";
import { gameSeed } from "@/lib/games/seed";
import { buildWheel, SECTOR_ANGLE, SECTOR_COUNT, spinSequence } from "@/lib/games/wheel";

const content = WheelContent.parse({
  kind: "wheel",
  sectors: Array.from({ length: 8 }, (_, i) => ({
    category: `Kategoriya ${String(i)}`,
    question: `Savol ${String(i)}?`,
    answer: `Javob ${String(i)}`,
  })),
});

const SEED = gameSeed("doc-1", 0);

describe("buildWheel", () => {
  const built = buildWheel(content, SEED);

  it("sakkiz sektor", () => {
    expect(built.kind).toBe("wheel");
    expect(built.sectors).toHaveLength(SECTOR_COUNT);
  });

  it("kategoriyalar TAKRORLANMAYDI", () => {
    const categories = built.sectors.map((s) => s.category);
    expect(new Set(categories).size).toBe(SECTOR_COUNT);
  });

  it("hamma sektor saqlanadi, yo'qolmaydi", () => {
    expect(built.sectors.map((s) => s.category).sort()).toEqual(
      content.sectors.map((s) => s.category).sort(),
    );
  });

  it("savol va javob juftligi buzilmaydi", () => {
    // Aralashtirish SEKTOR darajasida: savol bir sektordan, javob
    // boshqasidan kelib qolmasligi kerak.
    for (const sector of built.sectors) {
      const index = sector.category.replace("Kategoriya ", "");
      expect(sector.question).toBe(`Savol ${index}?`);
      expect(sector.answer).toBe(`Javob ${index}`);
    }
  });

  it("sektor burchagi 45 gradus", () => {
    expect(SECTOR_ANGLE).toBe(45);
    expect(SECTOR_ANGLE * SECTOR_COUNT).toBe(360);
  });

  it("bir urug' -> bir tartib", () => {
    expect(buildWheel(content, SEED)).toEqual(buildWheel(content, SEED));
  });

  it("boshqa urug' -> boshqa tartib", () => {
    // `?variant` g'ildirakda ham ishlashi kerak: mazmun bir xil, panjara
    // esa yo'q, ya'ni farq faqat tartibdan chiqadi.
    const a = buildWheel(content, gameSeed("doc-1", 0));
    const b = buildWheel(content, gameSeed("doc-1", 1));
    expect(a.sectors.map((s) => s.category)).not.toEqual(b.sectors.map((s) => s.category));
  });

  it("kirish mazmuni O'ZGARTIRILMAYDI", () => {
    const before = JSON.stringify(content);
    buildWheel(content, SEED);
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe("spinSequence", () => {
  it("so'ralgan uzunlikni beradi", () => {
    expect(spinSequence(SEED, 10)).toHaveLength(10);
    expect(spinSequence(SEED, 0)).toEqual([]);
  });

  it("indekslar chegara ichida", () => {
    for (const index of spinSequence(SEED, 200)) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(SECTOR_COUNT);
      expect(Number.isInteger(index)).toBe(true);
    }
  });

  it("KETMA-KET bir xil sektor chiqmaydi", () => {
    // Ikki marta ketma-ket bir xil savol tushsa bola "g'ildirak buzilgan"
    // deb o'ylaydi va o'qituvchi savolni qo'lda o'tkazishga majbur bo'ladi.
    for (let variant = 0; variant < 50; variant += 1) {
      const sequence = spinSequence(gameSeed("doc-1", variant), 100);
      for (let i = 1; i < sequence.length; i += 1) {
        expect(sequence[i], `urug' ${String(variant)}, ${String(i)}-aylantirish`).not.toBe(
          sequence[i - 1],
        );
      }
    }
  });

  it("deterministik", () => {
    expect(spinSequence(SEED, 20)).toEqual(spinSequence(SEED, 20));
  });

  it("boshqa urug' -> boshqa ketma-ketlik", () => {
    expect(spinSequence(gameSeed("doc-1", 0), 20)).not.toEqual(
      spinSequence(gameSeed("doc-1", 1), 20),
    );
  });

  it("prefiks barqaror — uzunlik oshsa boshi o'zgarmaydi", () => {
    // O'qituvchi o'yinni davom ettirsa, oldingi aylantirishlar o'zgarmasligi
    // kerak: komponent ketma-ketlikni bir marta oladi va indeks bo'yicha
    // kezadi.
    const short = spinSequence(SEED, 5);
    expect(spinSequence(SEED, 20).slice(0, 5)).toEqual(short);
  });

  it("hamma sektor oxir-oqibat chiqadi", () => {
    const seen = new Set(spinSequence(SEED, 400));
    expect(seen.size).toBe(SECTOR_COUNT);
  });

  it("200 ms dan tez", () => {
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) spinSequence(gameSeed("doc-vaqt", i), 100);
    expect((performance.now() - start) / 100).toBeLessThan(200);
  });
});
