import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import {
  deckSlides,
  presenterView,
  quoteParts,
  slideLabel,
  twoColumns,
} from "@/lib/slides/deck";

/**
 * Taqdimot kontentini pleyer shakliga keltirish.
 *
 * `twoColumns` va `quoteParts` — `SLIDE_LAYOUTS` izohidagi render
 * qoidalarining bajarilishi. Ular shu yerda testlanadi, chunki komponent
 * testlanmaydi (React muhiti yo'q): qoida buzilsa hech narsa yiqilmas,
 * faqat slayd ekranda boshqacha chiqardi.
 */

function slide(overrides: Record<string, unknown> = {}) {
  return {
    id: "s2a-slide-0",
    type: "slide",
    layout: "bullets",
    title: "Tezlanish",
    bullets: ["punkt"],
    ...overrides,
  };
}

function content(blocks: unknown[]) {
  return DocumentContent.parse({ v: 1, blocks });
}

describe("deckSlides", () => {
  it("faqat slaydlarni oladi, sarlavhani TASHLAYDI", () => {
    // `slidesOutlineBlocks` qo'ygan `heading` hujjat sarlavhasining o'zi —
    // u sahifa chrome'ida ko'rinadi, slayd sifatida chiqarilsa taqdimot
    // nomsiz nol-slayd bilan boshlanardi.
    const parsed = content([
      { id: "s1-heading-0", type: "heading", level: 1, text: "Tezlanish" },
      slide({ id: "s2a-slide-0" }),
      slide({ id: "s2b-slide-0" }),
    ]);
    const slides = deckSlides(parsed);
    expect(slides.length).toBe(2);
    expect(slides.every((s) => s.type === "slide")).toBe(true);
  });

  it("contentJson tartibini SAQLAYDI, qayta saralamaydi", () => {
    // Muharrirda qo'lda ko'chirilgan slayd o'z joyida qolishi kerak, ya'ni
    // id bo'yicha saralash zararli bo'lardi (`s2b-...` `s2a-...` dan
    // alifbo bo'yicha keyin, lekin bu tasodif).
    const parsed = content([
      slide({ id: "s2b-slide-0", title: "Uchinchi" }),
      slide({ id: "s2a-slide-0", title: "Birinchi" }),
    ]);
    expect(deckSlides(parsed).map((s) => s.title)).toEqual(["Uchinchi", "Birinchi"]);
  });

  it("slaydsiz hujjatda bo'sh ro'yxat", () => {
    const parsed = content([{ id: "b1", type: "paragraph", text: "Matn." }]);
    expect(deckSlides(parsed)).toEqual([]);
  });
});

describe("presenterView", () => {
  const slides = [slide({ title: "Bir" }), slide({ title: "Ikki" })].map((s) =>
    DocumentContent.parse({ v: 1, blocks: [s] }).blocks[0]!,
  ) as ReturnType<typeof deckSlides>;

  it("joriy va keyingi slaydni beradi", () => {
    expect(presenterView(slides, 0)).toEqual({ current: slides[0], next: slides[1] });
  });

  it("oxirgi slaydda next null", () => {
    expect(presenterView(slides, 1)).toEqual({ current: slides[1], next: null });
  });

  it("chegaradan chiqqan indeks null beradi, throw QILMAYDI", () => {
    // Indeks `IntersectionObserver` dan keladi va slayd o'chirilganda bir
    // render orqada qolishi mumkin.
    expect(presenterView(slides, 9)).toEqual({ current: null, next: null });
    expect(presenterView([], 0)).toEqual({ current: null, next: null });
  });
});

describe("twoColumns", () => {
  it("punktlarni KETMA-KET yarmiga bo'ladi", () => {
    // Juft-toq navbatlashtirish EMAS: ["a","c"] / ["b","d"] ro'yxatning
    // o'qilish tartibini buzardi.
    expect(twoColumns(["a", "b", "c", "d"])).toEqual({
      left: ["a", "b"],
      right: ["c", "d"],
    });
  });

  it("toq sonda chap ustun kattaroq", () => {
    expect(twoColumns(["a", "b", "c"])).toEqual({ left: ["a", "b"], right: ["c"] });
  });

  it("bitta punkt va bo'sh ro'yxat", () => {
    expect(twoColumns(["a"])).toEqual({ left: ["a"], right: [] });
    expect(twoColumns([])).toEqual({ left: [], right: [] });
  });
});

describe("quoteParts", () => {
  it("birinchi punkt iqtibos, ikkinchisi manba", () => {
    expect(quoteParts(["Harakat saqlanadi", "Nyuton"])).toEqual({
      quote: "Harakat saqlanadi",
      source: "Nyuton",
    });
  });

  it("uchinchi va keyingilar TASHLANADI", () => {
    // Iqtibos slaydida ro'yxat bo'lmaydi — u `bullets` ko'rinishining ishi.
    expect(quoteParts(["Iqtibos", "Manba", "ortiqcha"])).toEqual({
      quote: "Iqtibos",
      source: "Manba",
    });
  });

  it("manbasiz va punktsiz holat", () => {
    expect(quoteParts(["Yolg'iz"])).toEqual({ quote: "Yolg'iz", source: null });
    expect(quoteParts([])).toEqual({ quote: null, source: null });
  });
});

describe("slideLabel", () => {
  it("indeks noldan, yorliq birdan", () => {
    expect(slideLabel(0, 12)).toEqual({ index: 1, total: 12 });
    expect(slideLabel(11, 12)).toEqual({ index: 12, total: 12 });
  });

  it("chegaradan oshgan indeks yorliqda ko'rinmaydi", () => {
    expect(slideLabel(99, 12)).toEqual({ index: 12, total: 12 });
  });

  it("bo'sh taqdimotda nol bilan bo'linish yo'q", () => {
    expect(slideLabel(0, 0)).toEqual({ index: 1, total: 0 });
  });
});
