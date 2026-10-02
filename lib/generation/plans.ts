import { z } from "zod";
import { blockId, type Block } from "@/lib/documents/blocks";

/**
 * `LESSON_PLAN` konveyerining bosqich rejasi.
 *
 * NEGA `total` QOTIB QOLMAYDI: og'ir darsda (90 daqiqa, qo'sh dars) skelet
 * 7-8 bosqich beradi va ularning hammasi uchun o'qituvchi/o'quvchi
 * harakatlarini BITTA javobda yozish Vercel Hobby'ning 60 soniyalik shiftiga
 * urilardi. Shuning uchun reja 1-bosqich natijasidan hisoblanadi: bosqichlar
 * ko'p bo'lsa mazmun ikkiga bo'linadi (`2a`, `2b`).
 *
 * Konveyerning qolgan qismi bosqich soniga BOG'LIQ EMAS — kursor, ijara va
 * `commitStage` faqat indeksni biladi (`lib/documents/lifecycle.ts`).
 */

/** Skelet shundan ko'p bosqich bersa, mazmun ikkiga bo'linadi. */
export const SPLIT_THRESHOLD = 5;

export type StageKind = "skeleton" | "content" | "closing";

export type StageSpec = {
  /** "1", "2", "2a", "2b", "3" — `purpose` va blok id lariga kiradi. */
  id: string;
  kind: StageKind;
  /** `content` uchun: skeletning qaysi bosqichlari (yarim ochiq [from, to)). */
  range?: { from: number; to: number };
};

export type GenerationPlan = { stages: StageSpec[] };

/**
 * Rejani skelet bosqichlari soniga qarab tuzadi.
 *
 * @param skeletonStageCount `null` — skelet hali yo'q (hujjat yaratilayotgan
 *        payt). Shunda 3 bosqichli boshlang'ich reja qaytadi: 1-bosqich
 *        indeksi baribir 0, ya'ni birinchi POST to'g'ri ishlaydi, va
 *        `progress.total` 1-bosqich commit'ida aniqlashadi.
 */
export function buildPlan(skeletonStageCount: number | null): GenerationPlan {
  const skeleton: StageSpec = { id: "1", kind: "skeleton" };
  const closing: StageSpec = { id: "3", kind: "closing" };

  if (skeletonStageCount === null) {
    return { stages: [skeleton, { id: "2", kind: "content" }, closing] };
  }

  if (skeletonStageCount <= SPLIT_THRESHOLD) {
    return {
      stages: [
        skeleton,
        { id: "2", kind: "content", range: { from: 0, to: skeletonStageCount } },
        closing,
      ],
    };
  }

  const half = Math.ceil(skeletonStageCount / 2);
  return {
    stages: [
      skeleton,
      { id: "2a", kind: "content", range: { from: 0, to: half } },
      { id: "2b", kind: "content", range: { from: half, to: skeletonStageCount } },
      closing,
    ],
  };
}

/**
 * Hujjat turining `purpose` dagi prefiksi.
 *
 * `DocumentType` ning O'ZI ishlatilmaydi: `purpose` — tahlil kaliti, enum
 * esa baza sxemasi. Ikkisini bog'lash enum qiymatini qayta nomlashni
 * bir yillik marja tarixini ikkiga bo'lib yuboradigan ishga aylantirardi.
 */
export type GenerationFeature = "lesson-plan" | "test";

/**
 * `LlmCall.purpose` — marja tahlili shu kalit bo'yicha guruhlanadi.
 *
 * Dars ishlanma uchun chiqish 10-sessiyada O'ZGARMADI
 * (`lesson-plan:stage-1`), ya'ni bazadagi eski qatorlar yangisi bilan bir
 * guruhda qoladi. Qo'shilgani faqat ikkinchi tur: `test:stage-*`.
 */
export function stagePurpose(spec: StageSpec, feature: GenerationFeature): string {
  return `${feature}:stage-${spec.id}`;
}

/* ------------------------------------------------------------------ */
/* Bosqich chiqish sxemalari                                           */
/* ------------------------------------------------------------------ */

/**
 * DIQQAT — bu sxemalar `lib/documents/blocks.ts` dagi `Block` union'i EMAS.
 *
 * Ular ataylab TOR va TEKIS: `id` maydoni yo'q (id ni server beradi),
 * discriminated union yo'q (`$ref`/`oneOf` Gemini zanjirida yiqiladi),
 * ixtiyoriy maydon yo'q (model "required" ni yaxshiroq bajaradi).
 */

const SkeletonStage = z.strictObject({
  title: z.string().min(3).max(120),
  minutes: z.number().int().min(1).max(120),
});

export const Stage1Out = z.strictObject({
  title: z.string().min(3).max(200),
  objectives: z.array(z.string().min(3).max(300)).min(2).max(8),
  materials: z.array(z.string().min(2).max(200)).min(1).max(12),
  stages: z.array(SkeletonStage).min(3).max(10),
});
export type Stage1Out = z.infer<typeof Stage1Out>;

export const Stage2Out = z.strictObject({
  stages: z
    .array(
      z.strictObject({
        title: z.string().min(3).max(120),
        minutes: z.number().int().min(1).max(120),
        teacherActions: z.array(z.string().min(3).max(500)).min(1).max(10),
        studentActions: z.array(z.string().min(3).max(500)).min(1).max(10),
      }),
    )
    .min(1)
    .max(10),
});
export type Stage2Out = z.infer<typeof Stage2Out>;

export const Stage3Out = z.strictObject({
  homework: z.strictObject({
    items: z.array(z.string().min(5).max(600)).min(1).max(5),
    estimatedMinutes: z.number().int().min(1).max(240),
  }),
  rubric: z.strictObject({
    criteria: z
      .array(
        z.strictObject({
          name: z.string().min(3).max(120),
          maxPoints: z.number().int().min(1).max(20),
          descriptors: z.array(z.string().min(3).max(300)).min(1).max(4),
        }),
      )
      .min(2)
      .max(5),
  }),
  notes: z
    .array(
      z.strictObject({
        tone: z.enum(["info", "warning", "tip"]),
        text: z.string().min(10).max(1_000),
      }),
    )
    .min(1)
    .max(4),
});
export type Stage3Out = z.infer<typeof Stage3Out>;

/* ------------------------------------------------------------------ */
/* Bloklarga o'girish                                                  */
/* ------------------------------------------------------------------ */

/**
 * 1-bosqich bloklar.
 *
 * Skelet bosqichlari (`out.stages`) bu yerda BLOK BO'LMAYDI: `stages` bloki
 * o'qituvchi/o'quvchi harakatlarini talab qiladi, ular esa hali yo'q. Skelet
 * `inputParams.skeleton` ga yoziladi (`commitStage` ning `paramsPatch` i) va
 * mazmun bosqichlari undan o'qiydi.
 */
export function stage1Blocks(spec: StageSpec, out: Stage1Out): Block[] {
  return [
    { id: blockId(spec.id, "heading", 0), type: "heading", level: 1, text: out.title },
    { id: blockId(spec.id, "objectives", 0), type: "objectives", items: out.objectives },
    { id: blockId(spec.id, "materials", 0), type: "materials", items: out.materials },
  ];
}

export function stage2Blocks(spec: StageSpec, out: Stage2Out): Block[] {
  return [{ id: blockId(spec.id, "stages", 0), type: "stages", items: out.stages }];
}

export function stage3Blocks(spec: StageSpec, out: Stage3Out): Block[] {
  return [
    {
      id: blockId(spec.id, "homework", 0),
      type: "homework",
      items: out.homework.items,
      estimatedMinutes: out.homework.estimatedMinutes,
    },
    { id: blockId(spec.id, "rubric", 0), type: "rubric", criteria: out.rubric.criteria },
    ...out.notes.map((note, i) => ({
      id: blockId(spec.id, "note", i),
      type: "note" as const,
      tone: note.tone,
      text: note.text,
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Bosqich ko'rsatmalari (kesh chegarasidan KEYIN)                     */
/* ------------------------------------------------------------------ */

/**
 * Bosqichga xos ko'rsatma — `messages` ga boradi, `system` ga EMAS.
 *
 * `system` ga tushsa 2-bosqich 1-bosqichning kesh prefiksini buzadi va kesh
 * butunlay yo'qoladi (narx bir necha barobar oshadi).
 */
export function stageInstruction(
  spec: StageSpec,
  ctx: { durationMinutes: number; skeleton: Stage1Out | null },
): string {
  if (spec.kind === "skeleton") {
    return [
      "Dars ishlanmasining SKELETINI tuz.",
      "",
      "Kerak:",
      "- darsning sarlavhasi;",
      `- 3-5 ta o'lchanadigan ta'lim maqsadi;`,
      "- kerakli materiallar ro'yxati;",
      "- dars bosqichlari: har biri uchun nom va ajratilgan daqiqa.",
      "",
      `Bosqich daqiqalarining yig'indisi aynan ${String(ctx.durationMinutes)} bo'lsin.`,
      "Bosqichlar mazmunini (o'qituvchi va o'quvchi harakatlarini) HOZIR yozma —",
      "u keyingi bosqichda so'raladi.",
    ].join("\n");
  }

  const skeleton = ctx.skeleton;
  if (skeleton === null) {
    throw new Error(`stageInstruction: "${spec.id}" bosqichi uchun skelet yo'q`);
  }

  if (spec.kind === "content") {
    const range = spec.range ?? { from: 0, to: skeleton.stages.length };
    const wanted = skeleton.stages.slice(range.from, range.to);

    return [
      "Quyidagi dars bosqichlarini TO'LDIR.",
      "",
      "Darsning umumiy rejasi (kontekst uchun):",
      ...skeleton.stages.map(
        (stage, i) => `${String(i + 1)}. ${stage.title} — ${String(stage.minutes)} daqiqa`,
      ),
      "",
      "Endi FAQAT quyidagi bosqichlar uchun o'qituvchi va o'quvchi harakatlarini yoz:",
      ...wanted.map(
        (stage, i) =>
          `${String(range.from + i + 1)}. ${stage.title} — ${String(stage.minutes)} daqiqa`,
      ),
      "",
      "Nom va daqiqani o'zgartirmasdan qaytar. Boshqa bosqichlarni qo'shma.",
      "Har bosqichda o'quvchi harakati faol bo'lsin — faqat tinglash emas.",
    ].join("\n");
  }

  return [
    "Darsni yakunlovchi qismni yoz.",
    "",
    `Dars: ${skeleton.title}`,
    "Ta'lim maqsadlari:",
    ...skeleton.objectives.map((objective) => `- ${objective}`),
    "",
    "Kerak:",
    "- uy vazifasi: 1-2 aniq topshiriq va bajarish vaqti (daqiqada);",
    "- baholash mezonlari: 2-5 ta, har biri kuzatiladigan bo'lsin;",
    "- izohlar: kamida bittasi farqli yondashuv haqida (kuchsizroq o'quvchiga",
    "  yordam va tezroq tugatganga qo'shimcha topshiriq).",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Arzon strukturaviy darvoza                                          */
/* ------------------------------------------------------------------ */

export type SkeletonGate = { ok: true } | { ok: false; reason: string };

/**
 * 1-bosqichdan KEYIN, 2-bosqichdan OLDIN ishlaydigan arzon qorovul.
 *
 * NEGA KERAK: skelet buzuq bo'lsa (masalan 90 daqiqalik darsga 15 daqiqalik
 * bosqichlar) undan keyingi ikki bosqich ham yaroqsiz chiqadi. Ularni
 * baribir generatsiya qilib, oxirida `scoreDocument` bilan rad etish — ikki
 * ortiqcha LLM chaqiruvining puli. Bu darvoza shu pulni tejaydi.
 *
 * Bu TO'LIQ sifat bahosi emas: chegara ataylab keng (+-20 %), chunki yumshoq
 * chetlanishlarni `lib/generation/quality.ts` ball bilan jazolaydi, bu yerda
 * esa faqat FALOKAT ushlanadi.
 */
export function checkSkeleton(out: Stage1Out, durationMinutes: number): SkeletonGate {
  if (out.stages.length < 2) {
    return { ok: false, reason: "skelet: bosqich soni 2 dan kam" };
  }

  const total = out.stages.reduce((sum, stage) => sum + stage.minutes, 0);
  const drift = Math.abs(total - durationMinutes) / durationMinutes;
  if (drift > 0.2) {
    return {
      ok: false,
      reason: `skelet: daqiqalar yig'indisi ${String(total)}, so'ralgani ${String(durationMinutes)}`,
    };
  }

  return { ok: true };
}
