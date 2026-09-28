"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { creditCost } from "@/lib/credits/cost-table";
import { isCreditError } from "@/lib/credits/errors";
import { hold } from "@/lib/credits/ledger";
import { EMPTY_CONTENT } from "@/lib/documents/blocks";
import { prisma } from "@/lib/db";
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

const startSchema = z.object({
  topicId: z.string().min(1).max(64),
  durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION),
});

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

  const { topicId, durationMinutes } = parsed.data;

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
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
  const cost = creditCost({ type: "LESSON_PLAN" });

  const contextChunkIds = await resolveContextChunks(topicId);

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
          type: "LESSON_PLAN",
          title: topic.titleUz,
          status: "QUEUED",
          creditsHeldFor: cost,
          // `{}` EMAS, `null` EMAS: `commitStage` dagi `jsonb` append
          // mavjud massivni talab qiladi va `v` hujjat yaratilgan paytdagi
          // kontent versiyasini qayd etadi.
          contentJson: EMPTY_CONTENT,
          inputParams: {
            durationMinutes,
            contextChunkIds,
            // `progress` obyekti SHU YERDA yaratilishi shart: `jsonb_set`
            // oxirgi kalitni yaratadi, ota obyektni emas. `total` — dastlabki
            // taxmin, 1-bosqich uni aniqlaydi (`lib/generation/plans.ts`).
            progress: { stage: 0, total: 3, attempts: 0 },
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
