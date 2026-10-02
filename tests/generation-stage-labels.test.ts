import { describe, expect, it } from "vitest";
import { buildPlan, SPLIT_THRESHOLD } from "@/lib/generation/plans";
import { buildTestPlan, TEST_SPLIT_THRESHOLD } from "@/lib/generation/plans-test";
import {
  stageLabelInputFromDocument,
  stageLabels,
  stageRows,
} from "@/lib/generation/stage-labels";

/**
 * Bosqich ro'yxati — bezak, haqiqat manbai `progress.total`. Shuning uchun
 * bu testning markaziy da'vosi: ro'yxat uzunligi HAR DOIM haqiqiy reja
 * quruvchilari bergan songa teng. Agar reja o'zgarsa (masalan
 * `SPLIT_THRESHOLD` boshqa bo'lsa), test yiqiladi — UI jimgina rejadan
 * ajralib ketmaydi.
 */

describe("stageLabels — LESSON_PLAN", () => {
  it("skelet hali yo'q (null) -> 3 bosqich", () => {
    const labels = stageLabels({ type: "LESSON_PLAN", skeletonStageCount: null });
    expect(labels.map((stage) => stage.id)).toEqual(["1", "2", "3"]);
  });

  it("skelet kichik -> 3 bosqich", () => {
    const labels = stageLabels({
      type: "LESSON_PLAN",
      skeletonStageCount: SPLIT_THRESHOLD,
    });
    expect(labels.map((stage) => stage.id)).toEqual(["1", "2", "3"]);
  });

  it("skelet katta -> 4 bosqich (mazmun ikkiga bo'linadi)", () => {
    const labels = stageLabels({
      type: "LESSON_PLAN",
      skeletonStageCount: SPLIT_THRESHOLD + 1,
    });
    expect(labels.map((stage) => stage.id)).toEqual(["1", "2a", "2b", "3"]);
  });

  it("3 -> 4 o'tishi aynan SPLIT_THRESHOLD da bo'ladi", () => {
    // Bu o'qituvchi ko'radigan xatti-harakat: 1-bosqich tugagach ro'yxatga
    // yangi qator QO'SHILADI. Chegara siljisa, UI bir bosqichni yo'qotardi.
    expect(
      stageLabels({ type: "LESSON_PLAN", skeletonStageCount: SPLIT_THRESHOLD }),
    ).toHaveLength(3);
    expect(
      stageLabels({
        type: "LESSON_PLAN",
        skeletonStageCount: SPLIT_THRESHOLD + 1,
      }),
    ).toHaveLength(4);
  });
});

describe("stageLabels — TEST", () => {
  it("kam savol -> 3 bosqich", () => {
    expect(
      stageLabels({ type: "TEST", questionCount: TEST_SPLIT_THRESHOLD }).map(
        (stage) => stage.id,
      ),
    ).toEqual(["1", "2", "3"]);
  });

  it("ko'p savol -> 4 bosqich", () => {
    expect(
      stageLabels({ type: "TEST", questionCount: TEST_SPLIT_THRESHOLD + 1 }).map(
        (stage) => stage.id,
      ),
    ).toEqual(["1", "2a", "2b", "3"]);
  });
});

describe("stageLabels haqiqiy reja quruvchilari bilan mos", () => {
  it.each([null, 1, 3, 5, 6, 8, 12])(
    "LESSON_PLAN, skeletonStageCount=%s",
    (count) => {
      expect(
        stageLabels({ type: "LESSON_PLAN", skeletonStageCount: count }),
      ).toEqual(buildPlan(count).stages);
    },
  );

  it.each([5, 10, 20, 21, 25, 40])("TEST, questionCount=%s", (count) => {
    expect(stageLabels({ type: "TEST", questionCount: count })).toEqual(
      buildTestPlan(count).stages,
    );
  });
});

describe("stageRows — qism raqamlash", () => {
  it("har kind bir marta uchrasa suffiks yo'q", () => {
    const rows = stageRows(
      stageLabels({ type: "LESSON_PLAN", skeletonStageCount: 3 }),
    );
    expect(rows).toEqual([
      { id: "1", kind: "skeleton" },
      { id: "2", kind: "content" },
      { id: "3", kind: "closing" },
    ]);
  });

  it("takrorlangan kind (1/2) va (2/2) oladi", () => {
    const rows = stageRows(
      stageLabels({ type: "LESSON_PLAN", skeletonStageCount: 8 }),
    );
    expect(rows).toEqual([
      { id: "1", kind: "skeleton" },
      { id: "2a", kind: "content", part: { index: 1, count: 2 } },
      { id: "2b", kind: "content", part: { index: 2, count: 2 } },
      { id: "3", kind: "closing" },
    ]);
  });

  it("faqat takrorlangan kind part oladi, boshqalari yo'q", () => {
    const rows = stageRows(
      stageLabels({ type: "TEST", questionCount: 40 }),
    );
    const withPart = rows.filter((row) => row.part !== undefined);
    expect(withPart.map((row) => row.kind)).toEqual(["content", "content"]);
    expect(rows[0]?.part).toBeUndefined();
    expect(rows[3]?.part).toBeUndefined();
  });

  it("qator soni rejadagi bosqich sonidan farq qilmaydi", () => {
    for (const count of [null, 3, 5, 6, 9]) {
      const labels = stageLabels({
        type: "LESSON_PLAN",
        skeletonStageCount: count,
      });
      expect(stageRows(labels)).toHaveLength(labels.length);
    }
  });

  it("bo'sh reja bo'sh ro'yxat beradi (himoya)", () => {
    expect(stageRows([])).toEqual([]);
  });
});

describe("stageLabelInputFromDocument — buzuq inputParams ga chidamli", () => {
  it("TEST: questionCount o'qiladi", () => {
    expect(
      stageLabelInputFromDocument("TEST", {
        questionCount: 25,
        contextChunkIds: [],
      }),
    ).toEqual({ type: "TEST", questionCount: 25 });
  });

  it("TEST: questionCount yo'q -> null (nomsiz qatorlar ko'rsatiladi)", () => {
    expect(stageLabelInputFromDocument("TEST", {})).toBeNull();
  });

  it("LESSON_PLAN: skelet yo'q -> dastlabki 3 bosqichli reja", () => {
    const input = stageLabelInputFromDocument("LESSON_PLAN", {
      durationMinutes: 45,
    });
    expect(input).toEqual({ type: "LESSON_PLAN", skeletonStageCount: null });
    expect(stageLabels(input!)).toHaveLength(3);
  });

  it("LESSON_PLAN: skelet bor -> bosqich soni skeletdan hisoblanadi", () => {
    const input = stageLabelInputFromDocument("LESSON_PLAN", {
      durationMinutes: 90,
      skeleton: { stages: Array.from({ length: 8 }, () => ({})) },
    });
    expect(input).toEqual({ type: "LESSON_PLAN", skeletonStageCount: 8 });
    expect(stageLabels(input!)).toHaveLength(4);
  });

  it.each([
    ["null", null],
    ["satr", "buzuq"],
    ["massiv", []],
    ["noto'g'ri skeleton shakli", { skeleton: { stages: "ikki" } }],
  ] as const)("%s -> null, throw qilmaydi", (_label, input) => {
    expect(() =>
      stageLabelInputFromDocument("LESSON_PLAN", input),
    ).not.toThrow();
    expect(stageLabelInputFromDocument("LESSON_PLAN", input)).toBeNull();
  });
});
