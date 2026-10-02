import { z } from "zod";

/**
 * Hujjat kontentining SAQLASH shartnomasi.
 *
 * MUHIM — BU UNION `runLlm` GA BERILMAYDI. LLM'ga bosqichga xos tor sxema
 * ketadi (`lib/generation/plans.ts`), natija esa shu yerdagi bloklarga sof TS
 * kodi bilan o'giriladi. Ikki sabab:
 *
 *   1. `lib/llm/structured.ts:toJsonSchema` = `z.toJSONSchema(schema)`. Bu
 *      union'dan 12 tarmoqli `oneOf` + `$defs`/`$ref` chiqaradi. Zanjir
 *      Gemini'ga tushganda (`lib/llm/router.ts:buildChain` buni qiladi)
 *      `$ref` jimgina `invalid_output` ga aylanadi — ya'ni kredit qaytariladi,
 *      lekin sabab kodda emas, sxema shaklida bo'ladi.
 *   2. Union modeldan BLOK TURINI TANLASHNI talab qiladi. Bizga bu kerak
 *      emas: 1-bosqichda aynan `heading + objectives + materials + stages`
 *      chiqishi kerakligini BIZ bilamiz. Ortiqcha erkinlik — xato manbai.
 *
 * MARKDOWN: sxema markdown'ni RAD ETMAYDI. Rad etsa bitta `**` butun bosqichni
 * yoqib yuborardi va o'qituvchi mazmunan to'liq hujjatni yo'qotardi. Markdown
 * artefakti `lib/generation/quality.ts` da BALL yo'qotadi — shakl (bu fayl) va
 * sifat (o'sha fayl) ataylab ajratilgan.
 */

/**
 * `z.strictObject` — HAMMA joyda. Noma'lum kalit jimgina tushib qolmasin:
 * `contentJson` bazada yillab yashaydi va uni keyingi sessiyalar o'qiydi.
 */

/** Blok identifikatori — `blockId()` yasaydi, model EMAS. */
const Id = z.string().min(1).max(64);

/** Sof matn maydoni. Formatlash blok TURI orqali, matn ichida emas. */
const txt = (max: number) => z.string().trim().min(1).max(max);

/** Bloom taksonomiyasi — `question.bloom` va sifat bahosi uchun. */
export const BLOOM = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
] as const;

export type BloomLevel = (typeof BLOOM)[number];

const Bloom = z.enum(BLOOM);

const Heading = z.strictObject({
  id: Id,
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: txt(200),
});

const Paragraph = z.strictObject({
  id: Id,
  type: z.literal("paragraph"),
  text: txt(4_000),
});

const ListBlock = z.strictObject({
  id: Id,
  type: z.literal("list"),
  style: z.enum(["ordered", "bullet"]),
  items: z.array(txt(500)).min(1).max(30),
});

const TableBlock = z
  .strictObject({
    id: Id,
    type: z.literal("table"),
    caption: txt(200).optional(),
    headers: z.array(txt(120)).min(1).max(8),
    // Katak BO'SH bo'lishi mumkin (`txt` emas, `.max`) — jadvalda bo'sh katak
    // normal hol, lekin sarlavha bo'sh bo'lolmaydi.
    rows: z.array(z.array(z.string().trim().max(500)).min(1).max(8)).min(1).max(40),
  })
  .refine((table) => table.rows.every((row) => row.length === table.headers.length), {
    error: "Har satrdagi katak soni sarlavhalar soniga teng bo'lishi kerak",
    path: ["rows"],
  });

const Objectives = z.strictObject({
  id: Id,
  type: z.literal("objectives"),
  items: z.array(txt(300)).min(1).max(10),
});

const Materials = z.strictObject({
  id: Id,
  type: z.literal("materials"),
  items: z.array(txt(200)).min(1).max(20),
});

/**
 * Dars bosqichi. `minutes` — sifat bahosining asosi: yig'indi so'ralgan
 * davomiylikning +-10 % ichida bo'lishi kerak (`quality.ts`).
 */
export const StageItem = z.strictObject({
  title: txt(120),
  minutes: z.number().int().min(1).max(120),
  teacherActions: z.array(txt(500)).min(1).max(10),
  studentActions: z.array(txt(500)).min(1).max(10),
});
export type StageItem = z.infer<typeof StageItem>;

const Stages = z.strictObject({
  id: Id,
  type: z.literal("stages"),
  items: z.array(StageItem).min(2).max(10),
});

/**
 * Moslashtirish savolining bitta juftligi.
 *
 * NEGA ALOHIDA MAYDON, `options` ichida ajratgichli satr EMAS: atamaning
 * o'zida tire uchraydi ("Nyuton-metr — ish birligi"), ya'ni satrni
 * ajratgich bo'yicha bo'lish ertami-kechmi noto'g'ri joyda kesardi.
 * Bundan tashqari muharrir (13-sessiya) va eksport (17-sessiya) ham o'sha
 * kelishuvni bilishga majbur bo'lib qolardi.
 */
const Pair = z.strictObject({ left: txt(200), right: txt(200) });

/**
 * Bitta savol = bitta blok.
 *
 * `answer` — MATN, variant indeksi EMAS. Indeks variantlar tartibi
 * o'zgarganda (tahrirlash — 13-sessiya, tasodifiylashtirish — o'yin)
 * jimgina noto'g'ri javobga aylanadi; matn esa `answerKey` da va eksportda
 * o'zini o'zi tushuntiradi.
 *
 * `pairs` IXTIYORIY (10-sessiya): faqat `match` turida to'ldiriladi.
 * Ixtiyoriy bo'lgani uchun mavjud hujjatlar o'zgarishsiz tahlil qilinadi,
 * `DocumentContent.v` 1 da qoladi va migratsiya kerak emas.
 */
const Question = z
  .strictObject({
    id: Id,
    type: z.literal("question"),
    kind: z.enum(["mcq", "short", "truefalse", "match"]),
    text: txt(1_000),
    options: z.array(txt(300)).max(8).default([]),
    pairs: z.array(Pair).min(2).max(10).optional(),
    answer: txt(500),
    points: z.number().int().min(1).max(20),
    bloom: Bloom,
  })
  .superRefine((question, ctx) => {
    if (question.kind === "mcq") {
      // TURLI variant: bir xil matnli ikki variant "to'rt variant" bo'lib
      // ko'rinadi, lekin amalda tanlov bermaydi.
      if (new Set(question.options).size < 3) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "mcq: kamida 3 ta TURLI variant bo'lishi kerak",
        });
      }
      if (!question.options.includes(question.answer)) {
        ctx.addIssue({
          code: "custom",
          path: ["answer"],
          message: "mcq: to'g'ri javob variantlar ichida yo'q",
        });
      }
    }
    if (question.kind === "truefalse" && question.options.length !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "truefalse: variant ro'yxati bo'lmaydi",
      });
    }
    if (question.kind === "match") {
      // Juftliklar `pairs` da (yuqoridagi izoh), `options` da EMAS.
      if (question.pairs === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["pairs"],
          message: "match: juftliklar (pairs) bo'lishi kerak",
        });
      }
      if (question.options.length !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "match: variant ro'yxati bo'lmaydi, juftliklar pairs da",
        });
      }
    } else if (question.pairs !== undefined) {
      // BO'SH MASSIV HAM "BERILGAN": o'girgich (`plans-test.ts`) maydonni
      // `match` dan boshqa turda butunlay tashlab ketishi shart.
      ctx.addIssue({
        code: "custom",
        path: ["pairs"],
        message: "pairs faqat match turida bo'ladi",
      });
    }
  });

const AnswerKey = z.strictObject({
  id: Id,
  type: z.literal("answerKey"),
  items: z
    .array(
      z.strictObject({
        questionId: Id,
        answer: txt(500),
        explanation: txt(1_000).optional(),
      }),
    )
    .min(1)
    .max(50),
});

const Rubric = z.strictObject({
  id: Id,
  type: z.literal("rubric"),
  criteria: z
    .array(
      z.strictObject({
        name: txt(120),
        maxPoints: z.number().int().min(1).max(20),
        descriptors: z.array(txt(300)).min(1).max(5),
      }),
    )
    .min(1)
    .max(10),
});

const Homework = z.strictObject({
  id: Id,
  type: z.literal("homework"),
  items: z.array(txt(600)).min(1).max(10),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
});

const Note = z.strictObject({
  id: Id,
  type: z.literal("note"),
  tone: z.enum(["info", "warning", "tip"]),
  text: txt(1_000),
});

/**
 * Zod 4 da refinement sxema ICHIDA yashaydi, ya'ni `.refine()` /
 * `.superRefine()` `ZodObject` ni saqlaydi va `discriminatedUnion` uni qabul
 * qiladi (Zod 3 da bu `ZodEffects` bo'lib, union'ni buzardi).
 */
export const Block = z.discriminatedUnion("type", [
  Heading,
  Paragraph,
  ListBlock,
  TableBlock,
  Objectives,
  Materials,
  Stages,
  Question,
  AnswerKey,
  Rubric,
  Homework,
  Note,
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block["type"];

/**
 * `satisfies` — union'ga yangi blok qo'shilib, bu ro'yxat unutilsa
 * TypeScript shu yerda yiqiladi.
 */
export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "table",
  "objectives",
  "materials",
  "stages",
  "question",
  "answerKey",
  "rubric",
  "homework",
  "note",
] as const satisfies readonly BlockType[];

/**
 * `Document.contentJson` ning to'liq shakli.
 *
 * `v` — MIGRATSIYA kaliti: kontent shakli o'zgarsa eski hujjatlarni o'qish
 * uchun shu son kerak bo'ladi. Hujjat YARATILGANDA yoziladi, keyin emas.
 */
export const DocumentContent = z
  .strictObject({
    v: z.literal(1),
    // 400 — telefonda o'qiladigan hujjat uchun ataylab saxiy shift. Chegara
    // bitta buzuq bosqich butun `contentJson` ni shishirib yuborishiga qarshi.
    blocks: z.array(Block).max(400),
  })
  .refine((content) => new Set(content.blocks.map((b) => b.id)).size === content.blocks.length, {
    error: "Blok id lari takrorlangan",
    path: ["blocks"],
  });
export type DocumentContent = z.infer<typeof DocumentContent>;

/** `Document.create` da yoziladigan boshlang'ich qiymat. `{}` EMAS, `null` EMAS. */
export const EMPTY_CONTENT: DocumentContent = { v: 1, blocks: [] };

/**
 * Blok id — DETERMINISTIK, `cuid()` emas.
 *
 * Bosqich qayta bajarilsa (ijara tugab, boshqa ishchi egallasa) bloklar AYNI
 * id bilan yasaladi. Shunda ikkinchi yozuv `commitStage` darvozasidan o'tib
 * ketgan taqdirda ham `DocumentContent` ning id takrorlanmasin refine'i uni
 * ushlaydi — himoyaning ikkinchi qavati.
 */
export function blockId(stage: string, type: BlockType, index: number): string {
  return `s${stage}-${type}-${index}`;
}
