import { describe, expect, it } from "vitest";
import { Block, blockId, DocumentContent, SLIDE_LAYOUTS } from "@/lib/documents/blocks";

/**
 * Slayd bloki shartnomasi (14-sessiya).
 *
 * `SLIDE_LAYOUTS` — `contentJson` da SAQLANADIGAN enum, ya'ni a'zo qo'shish
 * oson, chiqarish esa eski hujjatlarni validatsiyadan yiqitadi. Shuning uchun
 * bu yerda nafaqat "oltitasi o'tadi", balki "`image` O'TMAYDI" ham qadalgan:
 * mahsulotda rasm generatsiyasi yo'q va u ko'rinish qaytib kelsa o'qituvchi
 * bo'sh freym ko'rardi.
 */

function slide(overrides: Record<string, unknown> = {}) {
  return {
    id: "s2a-slide-0",
    type: "slide",
    layout: "bullets",
    title: "Tezlanish nima?",
    bullets: ["Tezlikning o'zgarish tezligi", "Birligi m/s^2"],
    ...overrides,
  };
}

describe("slayd ko'rinishlari", () => {
  it("oltita, takrorsiz", () => {
    expect(SLIDE_LAYOUTS.length).toBe(6);
    expect(new Set(SLIDE_LAYOUTS).size).toBe(6);
  });

  it.each(SLIDE_LAYOUTS.map((layout) => [layout]))("%s round-trip dan o'tadi", (layout) => {
    const parsed = Block.safeParse(slide({ layout }));
    expect(parsed.success).toBe(true);
  });

  it("image rad etiladi — mahsulotda rasm yo'q", () => {
    expect(Block.safeParse(slide({ layout: "image" })).success).toBe(false);
  });

  it("noma'lum ko'rinish rad etiladi", () => {
    expect(Block.safeParse(slide({ layout: "video" })).success).toBe(false);
  });
});

describe("slayd maydonlari", () => {
  it("punktsiz slayd o'tadi va bo'sh ro'yxatga tushadi", () => {
    // `title`/`section` ko'rinishida punkt bo'lmasligi NORMAL HOL, shuning
    // uchun `bullets` ning `min()` i yo'q va `default([])` ishlaydi.
    const parsed = Block.parse({
      id: "s1-slide-0",
      type: "slide",
      layout: "section",
      title: "Mashq vaqti",
    });
    expect(parsed).toMatchObject({ type: "slide", bullets: [] });
  });

  it("sakkiz punkt o'tadi, to'qqiztasi rad etiladi", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `punkt ${String(i + 1)}`);
    expect(Block.safeParse(slide({ bullets: eight })).success).toBe(true);
    expect(Block.safeParse(slide({ bullets: [...eight, "to'qqiz"] })).success).toBe(false);
  });

  it("olti punkt SXEMADAN o'tadi — chegara sifat bahosida", () => {
    // 6x6 qoidasi `quality.ts` da ball yo'qotadi, sxemada TAQIQLANMAYDI:
    // o'qituvchi ortiqcha punktni o'zi o'chira oladi, lekin saqlanmaydigan
    // hujjat butun ishini bloklardi.
    const seven = Array.from({ length: 7 }, (_, i) => `punkt ${String(i + 1)}`);
    expect(Block.safeParse(slide({ bullets: seven })).success).toBe(true);
  });

  it("uzun punkt va uzun sarlavha rad etiladi", () => {
    expect(Block.safeParse(slide({ bullets: ["x".repeat(201)] })).success).toBe(false);
    expect(Block.safeParse(slide({ title: "x".repeat(121) })).success).toBe(false);
  });

  it("bo'sh punkt va bo'sh sarlavha rad etiladi", () => {
    expect(Block.safeParse(slide({ bullets: [""] })).success).toBe(false);
    expect(Block.safeParse(slide({ title: "   " })).success).toBe(false);
  });

  it("notes ixtiyoriy, bo'sh satr esa rad etiladi", () => {
    expect(Block.safeParse(slide()).success).toBe(true);
    expect(Block.safeParse(slide({ notes: "Formulani yozing." })).success).toBe(true);
    // Muharrir izohni bo'shatganda kalitni O'CHIRISHI shart, `""` yozmasligi
    // kerak — aks holda butun hujjat saqlanmay qoladi.
    expect(Block.safeParse(slide({ notes: "" })).success).toBe(false);
    expect(Block.safeParse(slide({ notes: "x".repeat(1_001) })).success).toBe(false);
  });

  it("noma'lum kalit rad etiladi (strictObject)", () => {
    // `imagePrompt` ATAYLAB qo'shilmagan: model so'ralmaydi, render
    // chiqarmaydi, UI ko'rsatmaydi — o'lik maydon bo'lardi. Shu test uni
    // jimgina qaytarib qo'yishdan saqlaydi.
    expect(Block.safeParse(slide({ imagePrompt: "tezlanish grafigi" })).success).toBe(false);
  });
});

describe("slayd id lari", () => {
  it("bosqich va indeksdan deterministik quriladi", () => {
    expect(blockId("2a", "slide", 0)).toBe("s2a-slide-0");
    expect(blockId("2b", "slide", 7)).toBe("s2b-slide-7");
  });

  it("ikki yarimdagi slaydlar bitta hujjatga sig'adi", () => {
    // `2a` va `2b` bosqichlari ALOHIDA chaqiruvda yoziladi, id lar esa
    // `DocumentContent` ning takrorlanmaslik refine'idan o'tishi kerak.
    const blocks = [
      { id: blockId("1", "heading", 0), type: "heading", level: 1, text: "Tezlanish" },
      ...Array.from({ length: 7 }, (_, i) => slide({ id: blockId("2a", "slide", i) })),
      ...Array.from({ length: 7 }, (_, i) => slide({ id: blockId("2b", "slide", i) })),
    ];
    const content = DocumentContent.parse({ v: 1, blocks });
    expect(content.blocks.length).toBe(15);
  });
});
