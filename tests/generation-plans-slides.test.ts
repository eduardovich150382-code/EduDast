import { describe, expect, it } from "vitest";
import { Block, DocumentContent, SLIDE_LAYOUTS, type SlideLayout } from "@/lib/documents/blocks";
import {
  buildSlidesPlan,
  checkSlideContent,
  checkSlidesOutline,
  normalizeLayouts,
  slideBlocks,
  slidesOutlineBlocks,
  slidesStageInstruction,
  SlidesContentOut,
  SlidesOutlineOut,
} from "@/lib/generation/plans-slides";
import type { StageSpec } from "@/lib/generation/plans";

/**
 * SLIDES bosqich rejasi (14-sessiya).
 *
 * Reja HAR DOIM uch bosqich, shuning uchun eng muhim invariant — ikki
 * yarimning oraliqlari butun taqdimotni bo'shliqsiz va kesishuvsiz
 * qoplashi: bo'shliq bo'lsa o'qituvchi to'lagan slayd umuman yozilmaydi,
 * kesishuv bo'lsa blok id lari to'qnashib hujjat yiqiladi.
 */

function outline(count: number): SlidesOutlineOut {
  return {
    title: "Tezlanish",
    slides: Array.from({ length: count }, (_, i) => ({
      title: `Slayd ${String(i + 1)}`,
      layout: (i === 0 ? "title" : "bullets") as SlideLayout,
      purpose: "Mavzuni tushuntiradi",
    })),
  };
}

function written(count: number): SlidesContentOut {
  return {
    slides: Array.from({ length: count }, (_, i) => ({
      bullets: [`punkt ${String(i + 1)}`],
      notes: "Doskaga formulani yozib ko'rsating.",
    })),
  };
}

const SPEC_2A: StageSpec = { id: "2a", kind: "content", range: { from: 0, to: 6 } };

describe("buildSlidesPlan", () => {
  it.each([8, 10, 12, 13, 14, 20])("%i slayd uchun har doim uch bosqich", (count) => {
    const plan = buildSlidesPlan(count);
    expect(plan.stages.map((s) => s.id)).toEqual(["1", "2a", "2b"]);
    expect(plan.stages.map((s) => s.kind)).toEqual(["skeleton", "content", "content"]);
  });

  it.each([8, 10, 12, 13, 14, 20])("%i slayd oraliqlari bo'shliqsiz qoplanadi", (count) => {
    const [, first, second] = buildSlidesPlan(count).stages;
    expect(first?.range).toBeDefined();
    expect(second?.range).toBeDefined();
    expect(first?.range?.from).toBe(0);
    // Chegara USTMA-UST: birinchining oxiri ikkinchining boshi.
    expect(first?.range?.to).toBe(second?.range?.from);
    expect(second?.range?.to).toBe(count);

    const covered = (first?.range?.to ?? 0) - (first?.range?.from ?? 0);
    const rest = (second?.range?.to ?? 0) - (second?.range?.from ?? 0);
    expect(covered + rest).toBe(count);
  });

  it("toq sonda birinchi yarim kattaroq bo'ladi", () => {
    const [, first, second] = buildSlidesPlan(13).stages;
    expect(first?.range).toEqual({ from: 0, to: 7 });
    expect(second?.range).toEqual({ from: 7, to: 13 });
  });

  it("yakunlovchi bosqich YO'Q", () => {
    // `notes` har slaydning maydoni, ya'ni alohida yakunlovchi chaqiruvga
    // yoziladigan narsa qolmaydi (modul izohiga qarang).
    expect(buildSlidesPlan(12).stages.some((s) => s.kind === "closing")).toBe(false);
  });
});

describe("checkSlidesOutline", () => {
  it("so'ralgan son bilan mos struktura o'tadi", () => {
    expect(checkSlidesOutline(outline(12), 12).ok).toBe(true);
  });

  it.each([
    [10, 12],
    [14, 12],
  ])("%i slayd qaytib %i so'ralganda yiqiladi", (got, wanted) => {
    const gate = checkSlidesOutline(outline(got), wanted);
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error("darvoza o'tib ketdi");
    expect(gate.reason).toContain(String(got));
    expect(gate.reason).toContain(String(wanted));
  });

  it("ko'rinishlar tekshirilmaydi — ular tuzatiladi", () => {
    const broken = outline(12);
    broken.slides[5] = { title: "O'rtadagi sarlavha", layout: "title", purpose: "X" };
    expect(checkSlidesOutline(broken, 12).ok).toBe(true);
  });
});

describe("normalizeLayouts", () => {
  it("birinchi slaydni title qiladi", () => {
    const fixed = normalizeLayouts([
      { title: "Bosh", layout: "bullets", purpose: "p" },
      { title: "Keyingi", layout: "bullets", purpose: "p" },
    ]);
    expect(fixed[0]?.layout).toBe("title");
    expect(fixed[1]?.layout).toBe("bullets");
  });

  it("o'rtadagi title ni section ga tushiradi", () => {
    const fixed = normalizeLayouts([
      { title: "Bosh", layout: "title", purpose: "p" },
      { title: "Bo'lim", layout: "title", purpose: "p" },
      { title: "Yana", layout: "title", purpose: "p" },
    ]);
    expect(fixed.map((s) => s.layout)).toEqual(["title", "section", "section"]);
  });

  it("boshqa ko'rinishlarga tegmaydi", () => {
    const input = SLIDE_LAYOUTS.map((layout) => ({ title: "T", layout, purpose: "p" }));
    const fixed = normalizeLayouts(input);
    // 0-indeks `title` edi va `title` qoladi; qolganlari o'zgarmaydi.
    expect(fixed.map((s) => s.layout)).toEqual([...SLIDE_LAYOUTS]);
  });

  it("natija SlidesOutlineOut sxemasidan o'tadi", () => {
    const fixed = { ...outline(12), slides: normalizeLayouts(outline(12).slides) };
    expect(SlidesOutlineOut.safeParse(fixed).success).toBe(true);
  });
});

describe("checkSlideContent", () => {
  it("kutilganicha yoki ko'proq slayd o'tadi", () => {
    expect(checkSlideContent(written(6), 6).ok).toBe(true);
    // Ortiqcha slayd `slideBlocks` da tashlanadi — darvoza yiqitmaydi.
    expect(checkSlideContent(written(8), 6).ok).toBe(true);
  });

  it("yetmagan slayd yiqiladi", () => {
    const gate = checkSlideContent(written(4), 6);
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error("darvoza o'tib ketdi");
    expect(gate.reason).toContain("4");
    expect(gate.reason).toContain("6");
  });
});

describe("slidesOutlineBlocks", () => {
  it("faqat sarlavha bloki qaytaradi", () => {
    const blocks = slidesOutlineBlocks({ id: "1", kind: "skeleton" }, outline(12));
    expect(blocks).toEqual([
      { id: "s1-heading-0", type: "heading", level: 1, text: "Tezlanish" },
    ]);
  });
});

describe("slideBlocks", () => {
  it("nom va ko'rinishni REJADAN oladi, punkt va izohni modeldan", () => {
    const planned = [
      { title: "Rejadagi nom", layout: "two-column" as SlideLayout },
      { title: "Ikkinchi", layout: "quote" as SlideLayout },
    ];
    const blocks = slideBlocks(SPEC_2A, planned, written(2));

    expect(blocks[0]).toEqual({
      id: "s2a-slide-0",
      type: "slide",
      layout: "two-column",
      title: "Rejadagi nom",
      bullets: ["punkt 1"],
      notes: "Doskaga formulani yozib ko'rsating.",
    });
    expect(blocks[1]).toMatchObject({ layout: "quote", title: "Ikkinchi" });
  });

  it("ortiqcha slaydni tashlaydi — reja uzunligi haqiqat manbai", () => {
    const planned = [{ title: "Yolg'iz", layout: "bullets" as SlideLayout }];
    expect(slideBlocks(SPEC_2A, planned, written(5)).length).toBe(1);
  });

  it("bloklar sxemadan o'tadi va ikki yarim bitta hujjatga sig'adi", () => {
    const full = outline(12);
    const planFirst = full.slides.slice(0, 6);
    const planSecond = full.slides.slice(6, 12);

    const blocks = [
      ...slidesOutlineBlocks({ id: "1", kind: "skeleton" }, full),
      ...slideBlocks(SPEC_2A, planFirst, written(6)),
      ...slideBlocks({ id: "2b", kind: "content", range: { from: 6, to: 12 } }, planSecond, written(6)),
    ];

    for (const block of blocks) {
      expect(Block.safeParse(block).success, JSON.stringify(block)).toBe(true);
    }
    // Takrorlanmaslik refine'i — id lar `2a`/`2b` bo'ylab to'qnashmasligi.
    const content = DocumentContent.parse({ v: 1, blocks });
    expect(content.blocks.length).toBe(13);
  });
});

describe("slidesStageInstruction", () => {
  it("struktura bosqichida slayd sonini aytadi va mazmun so'ramaydi", () => {
    const text = slidesStageInstruction({ id: "1", kind: "skeleton" }, {
      slideCount: 12,
      outline: null,
    });
    expect(text).toContain("12");
    expect(text).toContain("STRUKTURASINI");
    expect(text).toContain("MAZMUNINI");
  });

  it("mazmun bosqichida oraliq va punkt chegarasini aytadi", () => {
    const text = slidesStageInstruction(SPEC_2A, { slideCount: 12, outline: outline(12) });
    expect(text).toContain("1-6");
    expect(text).toContain("6 tadan ortiq punkt bo'lmasin");
    // Butun struktura kontekst sifatida beriladi, shunda model takrorlamaydi.
    expect(text).toContain("Slayd 12");
  });

  it("bosqich id si modelga oshkor qilinmaydi", () => {
    // `2a`/`2b` — bizning ichki kursorimiz. Promptga tushsa model uni
    // sarlavhaga yoki punktga ko'chirib yozishga urinardi.
    const text = slidesStageInstruction(SPEC_2A, { slideCount: 12, outline: outline(12) });
    expect(text).not.toContain("2a");
  });

  it("strukturasiz mazmun bosqichi xato tashlaydi", () => {
    expect(() =>
      slidesStageInstruction(SPEC_2A, { slideCount: 12, outline: null }),
    ).toThrow();
  });
});
