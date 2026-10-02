"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { creditCost, UNIT_LIMITS } from "@/lib/credits/cost-table";
import { isCreditError } from "@/lib/credits/errors";
import { hold } from "@/lib/credits/ledger";
import { EMPTY_CONTENT } from "@/lib/documents/blocks";
import { prisma } from "@/lib/db";
import { buildPlan } from "@/lib/generation/plans";
import { buildTestPlan } from "@/lib/generation/plans-test";
import { DIFFICULTIES, QUESTION_KINDS } from "@/lib/generation/prompts";
import { resolveContextChunks } from "@/lib/generation/retrieval";

/**
 * Generatsiya action'lari (docs/sessions/08 — dars ishlanma).
 *
 * Tartib: `"use server"` -> `requireOnboarded()` -> Zod -> biznes tekshiruv ->
 * yozish. Auth BIRINCHI await (CLAUDE.md 6-qoida): kirmagan chaqiruvchi
 * sxema haqida ham, mavzu bor-yo'qligi haqida ham hech narsa bilmasligi
 * kerak.
 *
 * NEGA `requireOnboarded`, `requireAuth` EMAS: mavzuga ruxsat o'qituvchining
 * fan va sinf ro'yxatidan tekshiriladi, ular esa onboarding'da to'ldiriladi.
 * Onboarding tugamagan foydalanuvchida ro'yxat bo'sh bo'lib, har mavzu rad
 * etilardi — sababi tushunarsiz bo'lardi.
 */

export type GenerationError =
  | "invalid"
  | "topilmadi"
  | "ruxsat"
  | "kredit"
  | "xato";

export type GenerationResult =
  | { ok: true; documentId: string }
  | { ok: false; error: GenerationError };

/**
 * Dars davomiyligi. 35 — qisqartirilgan dars, 90 — qo'sh dars.
 *
 * Yuqori chegara `blocks.ts` dagi `stages.minutes.max(120)` bilan mos:
 * bitta bosqich butun darsdan uzun bo'la olmaydi.
 */
const MIN_DURATION = 35;
const MAX_DURATION = 90;

const topicIdSchema = z.string().min(1).max(64);

/**
 * Boshlash parametrlari — HUJJAT TURI BO'YICHA diskriminatsiyalangan.
 *
 * `questionCount` chegarasi `UNIT_LIMITS.TEST` dan O'QILADI, qo'lda
 * takrorlanmaydi: narx jadvali ham, forma ham, bu validatsiya ham bitta
 * manbadan oziqlanadi (`lib/credits/cost-table.ts` dagi izoh). Takrorlansa
 * o'qituvchiga ko'rsatilgan narx bilan yechilgan kredit ertami-kechmi
 * farq qilardi.
 */
const startSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LESSON_PLAN"),
    topicId: topicIdSchema,
    durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION),
  }),
  z.object({
    type: z.literal("TEST"),
    topicId: topicIdSchema,
    questionCount: z
      .number()
      .int()
      .min(UNIT_LIMITS.TEST.min)
      .max(UNIT_LIMITS.TEST.max),
    kinds: z.array(z.enum(QUESTION_KINDS)).min(1).max(QUESTION_KINDS.length),
    difficulty: z.enum(DIFFICULTIES),
  }),
]);

/**
 * Dars ishlanma generatsiyasini BOSHLAYDI.
 *
 * LLM CHAQIRUVI BU YERDA YO'Q. Bu action faqat kreditni band qiladi va
 * `QUEUED` hujjat yaratadi; bosqichlarni `app/api/generate/[id]/bosqich`
 * bajaradi. Sabab: server action Vercel'da ham 60 soniyaga bo'ysunadi, uch
 * bosqichli konveyer esa unga sig'maydi.
 *
 * KONTEKST TRANZAKSIYADAN TASHQARIDA hal qilinadi: `resolveContextChunks`
 * embedding API'ga chiqadi, tarmoq chaqiruvi esa tranzaksiya ichida
 * `P2028` beradi (`lib/credits/ledger.ts` izohi).
 */
export async function boshlaGeneratsiya(input: unknown): Promise<GenerationResult> {
  const user = await requireOnboarded();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const req = parsed.data;

  const topic = await prisma.topic.findFirst({
    where: { id: req.topicId, deletedAt: null },
    select: {
      id: true,
      grade: true,
      titleUz: true,
      subject: { select: { slug: true } },
    },
  });
  if (!topic) return { ok: false, error: "topilmadi" };

  // Ruxsat: o'qituvchi faqat O'ZI tanlagan fan va sinf bo'yicha yaratadi.
  // Bu pul bilan bog'liq: tekshirilmasa bir hisob butun kurikulum bo'yicha
  // generatsiya qilib, kredit tizimini so'rovlar manbaiga aylantirardi.
  if (!user.subjects.includes(topic.subject.slug) || !user.grades.includes(topic.grade)) {
    return { ok: false, error: "ruxsat" };
  }

  // `id` OLDINDAN: `hold()` ga `documentId` kerak, `create` esa hali
  // bajarilmagan. Prisma `@default(cuid())` bo'lsa ham `data.id` ni qo'lda
  // berish mumkin.
  const documentId = randomUUID();
  const cost =
    req.type === "TEST"
      ? creditCost({ type: "TEST", questionCount: req.questionCount })
      : creditCost({ type: "LESSON_PLAN" });

  // Reja bosqichlari soni: testda SAVOL SONIDAN aniq hisoblanadi, dars
  // ishlanmada esa 1-bosqich skeletidan keyin aniqlashadi.
  const total =
    req.type === "TEST"
      ? buildTestPlan(req.questionCount).stages.length
      : buildPlan(null).stages.length;

  const contextChunkIds = await resolveContextChunks(req.topicId);

  try {
    await prisma.$transaction(async (tx) => {
      // `hold` -> `create` tartibi xavfsiz: `hold` faqat `User` ni
      // yangilaydi va `CreditTx` yozmaydi, `CreditTx.refId` esa `Document`
      // ga foreign key EMAS (oddiy `String?`). Ya'ni FK buzilishi yo'q.
      await hold(user.id, cost, documentId, { db: tx });

      await tx.document.create({
        data: {
          id: documentId,
          userId: user.id,
          topicId: topic.id,
          type: req.type,
          // `title` — MA'LUMOT, UI matni emas: hujjat ro'yxatida va
          // eksportda shu nom turadi, shuning uchun i18n qoidasiga
          // kirmaydi (`topic.titleUz` allaqachon shunday ishlatiladi).
          title: req.type === "TEST" ? `${topic.titleUz} — test` : topic.titleUz,
          status: "QUEUED",
          creditsHeldFor: cost,
          // `{}` EMAS, `null` EMAS: `commitStage` dagi `jsonb` append
          // mavjud massivni talab qiladi va `v` hujjat yaratilgan paytdagi
          // kontent versiyasini qayd etadi.
          contentJson: EMPTY_CONTENT,
          inputParams: {
            ...(req.type === "TEST"
              ? {
                  questionCount: req.questionCount,
                  kinds: req.kinds,
                  difficulty: req.difficulty,
                }
              : { durationMinutes: req.durationMinutes }),
            contextChunkIds,
            // `progress` obyekti SHU YERDA yaratilishi shart: `jsonb_set`
            // oxirgi kalitni yaratadi, ota obyektni emas. Dars ishlanmada
            // `total` — dastlabki taxmin, 1-bosqich uni aniqlaydi
            // (`lib/generation/plans.ts`); testda u boshidan aniq.
            progress: { stage: 0, total, attempts: 0 },
          },
        },
      });
    });
  } catch (e) {
    if (isCreditError(e)) {
      return { ok: false, error: e.kind === "insufficient" ? "kredit" : "xato" };
    }
    // Kutilmagan xato ATAYLAB yuqoriga: uni "xato" deb yutish baza
    // nosozligini jimgina yashirardi (`server/credit-actions.ts` naqshi).
    throw e;
  }

  return { ok: true, documentId };
}
