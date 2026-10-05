import { z } from "zod";
import { UNIT_LIMITS } from "@/lib/credits/cost-table";
import { blockId, SLIDE_LAYOUTS, type Block, type SlideLayout } from "@/lib/documents/blocks";
import type { GenerationPlan, SkeletonGate, StageSpec } from "./plans";

/**
 * `SLIDES` konveyerining bosqich rejasi (14-sessiya).
 *
 * `lib/generation/plans-test.ts` ning aynan naqshi: butun o'ziga xoslik shu
 * faylda, konveyer (kursor, ijara, `commitStage`, kredit) o'zgarishsiz qoladi.
 *
 * TESTDAN IKKI FARQI:
 *
 * 1. `closing` BOSQICHI YO'Q. Spetsifikatsiya uchinchi bosqichni "ikkinchi
 *    yarmi + o'qituvchi izohlari" deb ataydi, lekin `notes` — har slaydning
 *    MAYDONI. Faqat oxirgi bosqich izoh yozsa taqdimotning birinchi yarmi
 *    izohsiz qolardi, shuning uchun IKKALA mazmun bosqichi ham izoh yozadi va
 *    alohida yakunlovchi chaqiruvga yoziladigan narsa qolmaydi.
 *
 * 2. Reja HAR DOIM uchta bosqich — `TEST_SPLIT_THRESHOLD` analogi yo'q
 *    (pastdagi izohga qarang).
 */

/**
 * Reja har doim uch bosqich: struktura + ikki yarim.
 *
 * NEGA SHARTSIZ BO'LINADI: eng kichik taqdimot ham 8 slayd, har slayd esa
 * sarlavha + 6 tagacha punkt + izoh. Bularni bitta javobda so'rash Vercel
 * Hobby'ning 60 soniyalik shiftiga (`app/api/generate/[id]/bosqich/route.ts`)
 * urilardi. Narx ham shunga qurilgan: `cost-table.ts` dagi `BASE.SLIDES = 3`
 * izohi "struktura + 2 yarim" deydi, ya'ni shartli bo'linish o'qituvchi
 * to'lagan narx bilan bajarilgan ish sonini ajratib yuborardi.
 */
export function buildSlidesPlan(slideCount: number): GenerationPlan {
  const half = Math.ceil(slideCount / 2);
  return {
    stages: [
      { id: "1", kind: "skeleton" },
      { id: "2a", kind: "content", range: { from: 0, to: half } },
      { id: "2b", kind: "content", range: { from: half, to: slideCount } },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Bosqich chiqish sxemalari                                           */
/* ------------------------------------------------------------------ */

/**
 * DIQQAT — `plans.ts:93-99` dagi ogohlantirish bu yerga ham to'liq tegishli:
 * sxemalar TEKIS, `id` maydoni yo'q, union yo'q, IXTIYORIY MAYDON YO'Q.
 *
 * Mazmun bosqichida `title` va `layout` SO'RALMAYDI — ular 1-bosqich
 * rejasidan olinadi (`plans.ts` dagi "NOM va DAQIQA skeletdan" qarorining
 * aynan o'zi). Buning uchta foydasi bor:
 *   - "har slaydda sarlavha bor" strukturaviy KAFOLAT bo'ladi, tekshiruv emas;
 *   - "`title` ko'rinishi faqat birinchi slaydda" ham shunday;
 *   - javob kichrayadi, ya'ni 60 soniyalik shiftga yaqinlashish kamayadi.
 */

const OutlineSlide = z.strictObject({
  title: z.string().min(3).max(120),
  layout: z.enum(SLIDE_LAYOUTS),
  /** Bir jumla: o'qituvchi shu slaydda nima qiladi. Blokka TUSHMAYDI. */
  purpose: z.string().min(5).max(300),
});

export const SlidesOutlineOut = z.strictObject({
  title: z.string().min(3).max(200),
  slides: z.array(OutlineSlide).min(4).max(UNIT_LIMITS.SLIDES.max),
});
export type SlidesOutlineOut = z.infer<typeof SlidesOutlineOut>;

export const SlidesContentOut = z.strictObject({
  slides: z
    .array(
      z.strictObject({
        // Majburiy, lekin BO'SH BO'LISHI MUMKIN (`options`/`pairs` idiomasi):
        // `section` ko'rinishida punkt bo'lmasligi to'g'ri hol.
        bullets: z.array(z.string().min(1).max(200)).max(8),
        notes: z.string().min(10).max(1_000),
      }),
    )
    .min(1)
    .max(UNIT_LIMITS.SLIDES.max),
});
export type SlidesContentOut = z.infer<typeof SlidesContentOut>;

/* ------------------------------------------------------------------ */
/* Bloklarga o'girish                                                  */
/* ------------------------------------------------------------------ */

/**
 * 1-bosqich bloklari — faqat sarlavha.
 *
 * Rejaning O'ZI blok bo'lmaydi: u o'qituvchiga ko'rsatiladigan mazmun emas,
 * keyingi bosqichlar uchun ko'rsatma. `inputParams.outline` ga yoziladi
 * (`commitStage` ning `paramsPatch` i) — `skeleton`/`blueprint` bilan bir xil
 * yo'l.
 */
export function slidesOutlineBlocks(spec: StageSpec, out: SlidesOutlineOut): Block[] {
  return [{ id: blockId(spec.id, "heading", 0), type: "heading", level: 1, text: out.title }];
}

/**
 * Ko'rinishlar ketma-ketligini TUZATADI, darvozada yiqitmaydi.
 *
 * Nega tuzatish: birinchi slayd `title`, qolganlari esa `title` EMAS — bu
 * BIZNING taqdimot qoidasi, model mazmuni emas. Model buni chalkashtirganda
 * hujjatni bekor qilish (va kreditni qaytarib, o'qituvchini qayta urinishga
 * majburlash) mazmunga hech narsa qo'shmaydi: to'g'ri javob bitta va u
 * ma'lum, shuning uchun shu yerda qo'yiladi.
 *
 * `quality.ts` dagi `slide_layout:title_not_first` qoidasi shundan keyin
 * faqat MUHARRIRDAN kelgan kontentga tegishli bo'lib qoladi.
 */
export function normalizeLayouts(
  slides: readonly { title: string; layout: SlideLayout; purpose: string }[],
): { title: string; layout: SlideLayout; purpose: string }[] {
  return slides.map((slide, index) => {
    if (index === 0) return { ...slide, layout: "title" };
    return slide.layout === "title" ? { ...slide, layout: "section" } : { ...slide };
  });
}

/**
 * Mazmun bloklari: nom va ko'rinish REJADAN, punkt va izoh modeldan.
 *
 * Id lar `blockId(spec.id, ...)` dan, ya'ni `2a` va `2b` yarimlari o'zaro
 * to'qnashmaydi va `DocumentContent` ning takrorlanmaslik refine'idan o'tadi.
 *
 * Model so'ralganidan KO'P slayd qaytarsa ortig'i tashlanadi: `planned`
 * uzunligi — haqiqat manbai.
 */
export function slideBlocks(
  spec: StageSpec,
  planned: readonly { title: string; layout: SlideLayout }[],
  out: SlidesContentOut,
): Block[] {
  return planned.map((slide, index) => {
    const written = out.slides[index];
    const base = {
      id: blockId(spec.id, "slide", index),
      type: "slide" as const,
      layout: slide.layout,
      title: slide.title,
      bullets: written?.bullets ?? [],
    };
    // `notes` KALITI TASHLANADI, `undefined` qilib qo'yilmaydi: sxema uni
    // ixtiyoriy deb qabul qilsa ham, `contentJson` da `"notes": null` ga
    // aylangan kalit muharrirda "izoh bor, lekin bo'sh" holatini yasardi.
    // `checkSlideContent` dan keyin bu tarmoq amalda yuzaga chiqmaydi.
    return written === undefined ? base : { ...base, notes: written.notes };
  });
}

/* ------------------------------------------------------------------ */
/* Bosqich ko'rsatmalari (kesh chegarasidan KEYIN)                     */
/* ------------------------------------------------------------------ */

/** Rejani promptga tushadigan ro'yxat qilib yozadi. */
function outlineLines(slides: readonly { title: string; layout: SlideLayout; purpose: string }[]) {
  return slides.map(
    (slide, index) =>
      `${String(index + 1)}. ${slide.title} [${slide.layout}] — ${slide.purpose}`,
  );
}

export function slidesStageInstruction(
  spec: StageSpec,
  ctx: { slideCount: number; outline: SlidesOutlineOut | null },
): string {
  if (spec.kind === "skeleton") {
    return [
      "Taqdimotning STRUKTURASINI tuz.",
      "",
      "Kerak:",
      "- taqdimotning sarlavhasi;",
      `- aynan ${String(ctx.slideCount)} ta slayd nomi;`,
      "- har slaydga ko'rinish (layout) va bir jumlalik maqsad: o'qituvchi",
      "  shu slaydda nima qiladi.",
      "",
      "Birinchi slayd — taqdimotning sarlavhasi (title ko'rinishi).",
      "Oxirgi slayd — xulosa yoki uyga vazifa.",
      "Darsning yo'nalishi: sarlavha, maqsadlar, yangi mavzu, namuna, mashq, xulosa.",
      "Slaydlarning MAZMUNINI (punkt va izohni) hozir yozma — ular keyingi",
      "bosqichda so'raladi.",
    ].join("\n");
  }

  const outline = ctx.outline;
  if (outline === null) {
    throw new Error(`slidesStageInstruction: "${spec.id}" bosqichi uchun struktura yo'q`);
  }

  const range = spec.range ?? { from: 0, to: ctx.slideCount };
  const planned = outline.slides.slice(range.from, range.to);

  return [
    `Taqdimotning ${String(range.from + 1)}-${String(range.to)} slaydlarini yoz.`,
    "",
    `Taqdimot: ${outline.title}`,
    "",
    "Taqdimotning umumiy strukturasi (kontekst uchun):",
    ...outlineLines(outline.slides),
    "",
    `Endi AYNAN quyidagi ${String(planned.length)} ta slayd uchun punkt va izoh yoz:`,
    ...outlineLines(planned),
    "",
    "Qoidalar:",
    "- bitta slaydda 6 tadan ortiq punkt bo'lmasin;",
    "- punkt jumla EMAS, 3-9 so'zlik ibora. Oxirida nuqta qo'yma;",
    "- slayd sarlavhasini punkt ichida takrorlama;",
    "- section ko'rinishida punkt yozma (bo'sh ro'yxat qaytar);",
    "- quote ko'rinishida birinchi punkt iqtibosning o'zi, ikkinchisi muallif;",
    "- izoh (notes) O'QITUVCHI UCHUN: nima aytadi, qanday savol beradi,",
    "  qayerda to'xtaydi. Punktlarni qayta yozma.",
    "Oldingi yoki keyingi bosqichdagi slaydlarni takrorlama.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Arzon strukturaviy darvozalar                                       */
/* ------------------------------------------------------------------ */

/**
 * 1-bosqichdan KEYIN, 2-bosqichdan OLDIN ishlaydigan arzon qorovul.
 *
 * `checkBlueprint` bilan ayni maqsad: buzuq strukturadan keyingi bosqichlar
 * ham yaroqsiz chiqadi, ularni baribir generatsiya qilib oxirida rad etish
 * esa ikki qimmat chaqiruvning puli.
 *
 * Slayd SONI tekshiriladi, ko'rinishlar esa TEKSHIRILMAYDI — ular
 * `normalizeLayouts` da tuzatiladi.
 */
export function checkSlidesOutline(out: SlidesOutlineOut, slideCount: number): SkeletonGate {
  if (out.slides.length !== slideCount) {
    return {
      ok: false,
      reason: `struktura: ${String(out.slides.length)} ta slayd qaytdi, so'ralgani ${String(slideCount)}`,
    };
  }
  return { ok: true };
}

/**
 * Mazmun bosqichidan keyingi darvoza — BLOK SXEMASIDAN OLDIN.
 *
 * `<` ishlatiladi, `!==` emas: ortiqcha slayd `slideBlocks` da tashlanadi,
 * yetmagani esa tuzatib bo'lmaydigan kamchilik (sarlavhasi bor, mazmuni yo'q
 * slayd o'qituvchiga bo'sh ekran berardi). Bu `produceLessonBlocks` dagi
 * kechirimli tekshiruvning ayni naqshi.
 */
export function checkSlideContent(out: SlidesContentOut, expected: number): SkeletonGate {
  if (out.slides.length < expected) {
    return {
      ok: false,
      reason: `slaydlar: ${String(out.slides.length)} ta qaytdi, ${String(expected)} ta kerak`,
    };
  }
  return { ok: true };
}
