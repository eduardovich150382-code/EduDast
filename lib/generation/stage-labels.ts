import { z } from "zod";
import type { SupportedDocumentType } from "@/lib/documents/type-param";
import { buildPlan, type StageKind, type StageSpec } from "@/lib/generation/plans";
import { buildTestPlan } from "@/lib/generation/plans-test";

/**
 * Generatsiya bosqichlarining KO'RINADIGAN ro'yxati.
 *
 * Hujjatning 2-bandi soxta progress bar'ni taqiqlaydi va o'rniga haqiqiy
 * bosqich ro'yxatini talab qiladi: har bosqich nomi, tugagani ✓, joriysi
 * aylanuvchi, qolgani ○.
 *
 * NEGA REJA QAYTA HISOBLANADI, SAQLANMAYDI: `buildPlan` / `buildTestPlan`
 * kirishlari ALLAQACHON `Document.inputParams` da turadi (`questionCount`
 * va 1-bosqichdan keyin `skeleton`), ya'ni nomlarni olish uchun konveyerni
 * yurgizish ham, bazaga yangi ustun qo'shish ham shart emas.
 *
 * `LESSON_PLAN` da bosqich soni 1-BOSQICHDAN KEYIN O'ZGARADI (3 -> 4, og'ir
 * darsda mazmun `2a`/`2b` ga bo'linadi). Bu o'zi hal bo'ladi: `commitStage`
 * skeletni `inputParams.skeleton` ga yozadi, mijoz `router.refresh()`
 * chaqiradi, server sahifa esa rejani qaytadan quradi.
 *
 * Sof modul — test uni haqiqiy `buildPlan`/`buildTestPlan` ga qarab
 * tekshiradi, shuning uchun reja o'zgarsa UI jimgina ajralib ketmaydi.
 */

export type StageLabelInput =
  | { type: "LESSON_PLAN"; skeletonStageCount: number | null }
  | { type: "TEST"; questionCount: number };

/** Turga mos rejani quradi va bosqich ro'yxatini qaytaradi. */
export function stageLabels(input: StageLabelInput): StageSpec[] {
  return input.type === "TEST"
    ? buildTestPlan(input.questionCount).stages
    : buildPlan(input.skeletonStageCount).stages;
}

/**
 * Bitta ko'rinadigan qator.
 *
 * `part` faqat shu `kind` rejada BIR MARTADAN KO'P uchraganda to'ldiriladi
 * (`2a`/`2b`). Shunda UI "Dars bosqichlari (1/2)" deb yozadi va bosqich
 * id lari (`2a`) o'qituvchiga ko'rinmaydi — ular ichki nom, i18n kaliti
 * emas.
 */
export type StageRow = {
  id: string;
  kind: StageKind;
  part?: { index: number; count: number };
};

/** Rejani ko'rinadigan qatorlarga aylantiradi. */
export function stageRows(stages: readonly StageSpec[]): StageRow[] {
  const total = new Map<StageKind, number>();
  for (const stage of stages) {
    total.set(stage.kind, (total.get(stage.kind) ?? 0) + 1);
  }

  const seen = new Map<StageKind, number>();
  return stages.map((stage) => {
    const count = total.get(stage.kind) ?? 1;
    if (count <= 1) return { id: stage.id, kind: stage.kind };
    const index = (seen.get(stage.kind) ?? 0) + 1;
    seen.set(stage.kind, index);
    return { id: stage.id, kind: stage.kind, part: { index, count } };
  });
}

/**
 * `inputParams` dan reja kirishini HIMOYALANGAN holda o'qiydi.
 *
 * `run-stage.ts` o'sha obyektni `.parse` bilan o'qiydi (nomuvofiqlik =
 * dasturchi xatosi), bu yerda esa `safeParse`: bosqich ro'yxati bezak,
 * haqiqat manbai `progress.total`. Buzuq `inputParams` da `null` qaytadi va
 * UI nomsiz, lekin to'g'ri sondagi qatorlarni ko'rsatadi.
 */
const LabelParams = z.object({
  questionCount: z.number().int().optional(),
  skeleton: z.object({ stages: z.array(z.unknown()) }).optional(),
});

export function stageLabelInputFromDocument(
  type: SupportedDocumentType,
  inputParams: unknown,
): StageLabelInput | null {
  const parsed = LabelParams.safeParse(inputParams);
  if (!parsed.success) return null;

  if (type === "TEST") {
    const count = parsed.data.questionCount;
    return count === undefined ? null : { type: "TEST", questionCount: count };
  }

  return {
    type: "LESSON_PLAN",
    // `undefined` -> `null`: skelet hali yo'q, ya'ni 3 qatorlik dastlabki
    // reja. `buildPlan(null)` aynan shuni qaytaradi.
    skeletonStageCount: parsed.data.skeleton?.stages.length ?? null,
  };
}
