import { z } from "zod";
import { UNIT_LIMITS } from "@/lib/credits/cost-table";
import { DIFFICULTIES, QUESTION_KINDS } from "@/lib/generation/prompts";

/**
 * `boshlaGeneratsiya` ning KIRISH SHARTNOMASI.
 *
 * NEGA `server/generation-actions.ts` DAN KO'CHIRILDI: `"use server"` fayl
 * action'dan boshqa qiymat eksport qila olmaydi, ya'ni sxema o'sha faylda
 * turganda uni tashqaridan import qilib bo'lmaydi — na testdan, na
 * sehrgardan. Natijada sehrgar kerakli shaklni "taxmin qilib" qurardi va
 * nomuvofiqlik faqat ishlatish paytida `"invalid"` bo'lib chiqardi.
 *
 * Endi sxema shu yerda, action uni qaytib import qiladi, va
 * `tests/wizard-params.test.ts` sehrgar qurgan obyekt aynan shu sxemadan
 * o'tishini tekshiradi.
 */

/**
 * Dars davomiyligi. 35 — qisqartirilgan dars, 90 — qo'sh dars.
 *
 * Yuqori chegara `blocks.ts` dagi `stages.minutes.max(120)` bilan mos:
 * bitta bosqich butun darsdan uzun bo'la olmaydi.
 */
export const MIN_DURATION = 35;
export const MAX_DURATION = 90;

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
export const startSchema = z.discriminatedUnion("type", [
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

export type StartInput = z.infer<typeof startSchema>;
