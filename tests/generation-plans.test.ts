import { describe, expect, it } from "vitest";
import { DocumentContent } from "@/lib/documents/blocks";
import {
  buildPlan,
  checkSkeleton,
  SPLIT_THRESHOLD,
  stage1Blocks,
  stage2Blocks,
  stage3Blocks,
  stageInstruction,
  stagePurpose,
  Stage1Out,
  Stage2Out,
  Stage3Out,
} from "@/lib/generation/plans";

/**
 * Bosqich rejasi va bloklarga o'girish.
 *
 * ENG MUHIM XOSSA: `total` qotib qolmaydi. Og'ir darsda (90 daqiqa) skelet
 * 7-8 bosqich beradi va ularning hammasini bitta javobda to'ldirish
 * Vercel'ning 60 soniyalik shiftiga urilardi.
 */

function skeleton(stageCount: number): Stage1Out {
  return {
    title: "Tezlanish va uning birliklari",
    objectives: ["Tezlanishni ta'riflaydi", "Tezlanishni hisoblaydi"],
    materials: ["Doska", "Darslik"],
    stages: Array.from({ length: stageCount }, (_, i) => ({
      title: `${String(i + 1)}-bosqich`,
      minutes: 10,
    })),
  };
}

describe("buildPlan", () => {
  it("skelet noma'lum bo'lsa 3 bosqichli boshlang'ich reja", () => {
    const plan = buildPlan(null);
    expect(plan.stages.map((s) => s.id)).toEqual(["1", "2", "3"]);
    // Birinchi POST baribir 0-indeksda ishlaydi — kursor to'g'ri.
    expect(plan.stages[0]?.kind).toBe("skeleton");
  });

  it.each([2, 3, 4, SPLIT_THRESHOLD])("%i bosqich — bo'linmaydi", (count) => {
    const plan = buildPlan(count);
    expect(plan.stages.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(plan.stages[1]?.range).toEqual({ from: 0, to: count });
  });

  it.each([SPLIT_THRESHOLD + 1, 7, 8, 10])("%i bosqich — 2a/2b ga bo'linadi", (count) => {
    const plan = buildPlan(count);
    expect(plan.stages.map((s) => s.id)).toEqual(["1", "2a", "2b", "3"]);
  });

  it("bo'linganda bosqichlar deyarli teng va HAMMASI qoplanadi", () => {
    for (const count of [6, 7, 8, 9, 10]) {
      const plan = buildPlan(count);
      const a = plan.stages[1]!.range!;
      const b = plan.stages[2]!.range!;

      expect(a.from).toBe(0);
      expect(a.to).toBe(b.from); // bo'shliq yo'q, ustma-ust tushish yo'q
      expect(b.to).toBe(count);

      const sizeA = a.to - a.from;
      const sizeB = b.to - b.from;
      expect(Math.abs(sizeA - sizeB)).toBeLessThanOrEqual(1);
    }
  });

  it("purpose bo'linishni ko'rsatadi — marja tahlili uchun", () => {
    const plan = buildPlan(8);
    expect(plan.stages.map(stagePurpose)).toEqual([
      "lesson-plan:stage-1",
      "lesson-plan:stage-2a",
      "lesson-plan:stage-2b",
      "lesson-plan:stage-3",
    ]);
  });
});

describe("checkSkeleton", () => {
  it("to'g'ri skelet o'tadi", () => {
    // 4 bosqich x 10 daqiqa = 40, so'ralgani 45 -> chetlanish 11 %
    expect(checkSkeleton(skeleton(4), 45)).toEqual({ ok: true });
  });

  it("daqiqalar juda qochgan bo'lsa yiqiladi", () => {
    // 3 x 10 = 30, so'ralgani 90 -> 67 % chetlanish.
    const gate = checkSkeleton(skeleton(3), 90);
    expect(gate.ok).toBe(false);
  });

  it("bosqich soni 2 dan kam bo'lsa yiqiladi", () => {
    const broken: Stage1Out = { ...skeleton(3), stages: [{ title: "Bir", minutes: 45 }] };
    expect(checkSkeleton(broken, 45).ok).toBe(false);
  });

  it("chegara +-20 % — quality.ts dagi +-10 % dan kengroq", () => {
    // 45 daqiqaga 50 daqiqa (11 %) — darvozadan o'tadi, ballni esa
    // `quality.ts` pasaytiradi. Ikki chegara ataylab boshqa.
    const loose: Stage1Out = {
      ...skeleton(5),
      stages: Array.from({ length: 5 }, () => ({ title: "X", minutes: 10 })),
    };
    expect(checkSkeleton(loose, 45).ok).toBe(true);
  });
});

describe("bloklarga o'girish", () => {
  const spec = buildPlan(4).stages;

  it("1-bosqich: stages bloki YOZILMAYDI", () => {
    const blocks = stage1Blocks(spec[0]!, skeleton(4));
    // `stages` bloki harakatlarni talab qiladi, ular esa hali yo'q —
    // skelet `inputParams` ga boradi, `contentJson` ga emas.
    expect(blocks.map((b) => b.type)).toEqual(["heading", "objectives", "materials"]);
  });

  it("2-bosqich: bitta stages bloki", () => {
    const out: Stage2Out = {
      stages: [
        {
          title: "Kirish",
          minutes: 10,
          teacherActions: ["Savol beradi"],
          studentActions: ["Javob beradi"],
        },
      ],
    };
    const blocks = stage2Blocks(spec[1]!, out);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("stages");
  });

  it("3-bosqich: uy vazifasi, mezonlar va izohlar", () => {
    const out: Stage3Out = {
      homework: { items: ["12-mashqni yeching"], estimatedMinutes: 20 },
      rubric: {
        criteria: [
          { name: "Faollik", maxPoints: 5, descriptors: ["Ikki marta javob berdi"] },
          { name: "Aniqlik", maxPoints: 5, descriptors: ["Formulani to'g'ri qo'lladi"] },
        ],
      },
      notes: [{ tone: "tip", text: "Kuchsizroq o'quvchiga tayyor formula bering." }],
    };
    const blocks = stage3Blocks(spec[2]!, out);
    expect(blocks.map((b) => b.type)).toEqual(["homework", "rubric", "note"]);
  });

  it("yasalgan bloklar DocumentContent dan o'tadi", () => {
    // Bu o'girish kodining shartnomasi: `commitStage` shu `parse` ni
    // qiladi va yiqilsa butun bosqich bekor bo'lardi.
    const blocks = [
      ...stage1Blocks(spec[0]!, skeleton(4)),
      ...stage2Blocks(spec[1]!, {
        stages: [
          { title: "Kirish", minutes: 10, teacherActions: ["A"], studentActions: ["B"] },
          { title: "Yakun", minutes: 10, teacherActions: ["C"], studentActions: ["D"] },
        ],
      }),
    ];
    expect(DocumentContent.safeParse({ v: 1, blocks }).success).toBe(true);
  });

  it("bo'lingan bosqichlarning bloklari to'qnashmaydi", () => {
    const split = buildPlan(8).stages;
    const out: Stage2Out = {
      stages: [
        { title: "X", minutes: 10, teacherActions: ["A"], studentActions: ["B"] },
        { title: "Y", minutes: 10, teacherActions: ["C"], studentActions: ["D"] },
      ],
    };
    const blocks = [...stage2Blocks(split[1]!, out), ...stage2Blocks(split[2]!, out)];
    expect(new Set(blocks.map((b) => b.id)).size).toBe(2);
  });
});

describe("stageInstruction", () => {
  it("skelet bosqichi mazmun yozishni TAQIQLAYDI", () => {
    const text = stageInstruction(buildPlan(null).stages[0]!, {
      durationMinutes: 45,
      skeleton: null,
    });
    expect(text).toContain("45");
    expect(text).toContain("SKELETINI");
  });

  it("mazmun bosqichi faqat O'Z oralig'ini so'raydi", () => {
    const plan = buildPlan(8);
    const text = stageInstruction(plan.stages[2]!, {
      durationMinutes: 90,
      skeleton: skeleton(8),
    });
    // 2b — 5..8 bosqichlar; ro'yxatda 5-bosqich bor, 1-bosqich esa faqat
    // umumiy reja qismida.
    expect(text).toContain("5-bosqich");
    expect(text).toContain("Boshqa bosqichlarni qo'shma");
  });

  it("skeletsiz mazmun bosqichi xato beradi", () => {
    expect(() =>
      stageInstruction(buildPlan(4).stages[1]!, { durationMinutes: 45, skeleton: null }),
    ).toThrow();
  });
});

describe("bosqich sxemalari", () => {
  it("Stage1Out kamida 3 bosqich talab qiladi", () => {
    const broken = { ...skeleton(4), stages: [{ title: "Bir", minutes: 45 }] };
    expect(Stage1Out.safeParse(broken).success).toBe(false);
  });

  it("sxemalarda id maydoni YO'Q — id ni server beradi", () => {
    const withId = {
      ...skeleton(3),
      id: "s1",
    };
    expect(Stage1Out.safeParse(withId).success).toBe(false);
  });
});
