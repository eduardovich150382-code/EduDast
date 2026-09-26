import { describe, expect, it } from "vitest";
import { flattenTopicTree, type TopicTreeNode } from "@/lib/calendar/topic-sequence";

/**
 * lib/calendar/topic-sequence.ts — daraxtni global ketma-ketlikka yoyish.
 *
 * Eng muhim tekshiruv: `order` ota ichida takrorlanganda ham natija
 * barqaror va admin ko'rgan tartibga mos bo'lishi (07-sessiya rejasi).
 */

function node(id: string, overrides: Partial<TopicTreeNode> = {}): TopicTreeNode {
  return { id, parentId: null, order: 1, slug: id, ...overrides };
}

function idsOf(nodes: TopicTreeNode[]): string[] {
  return flattenTopicTree(nodes).map((topic) => topic.id);
}

/** fixtures/fizika-7-namuna.csv daraxti: 2 bo'lim, ichida 2 va 1 mavzu. */
function fixtureTree(): TopicTreeNode[] {
  return [
    node("harakat-va-kuch", { order: 1 }),
    node("mexanik-harakat", { parentId: "harakat-va-kuch", order: 1, hoursPlan: 2 }),
    node("tezlik", { parentId: "harakat-va-kuch", order: 2, hoursPlan: 2 }),
    node("issiqlik", { order: 2 }),
    node("harorat", { parentId: "issiqlik", order: 1, hoursPlan: 1 }),
  ];
}

describe("flattenTopicTree", () => {
  it("fixture daraxtini bo'limlarsiz, 1..N tartibda yoyadi", () => {
    const result = flattenTopicTree(fixtureTree());

    expect(result.map((topic) => topic.id)).toEqual(["mexanik-harakat", "tezlik", "harorat"]);
    expect(result.map((topic) => topic.order)).toEqual([1, 2, 3]);
  });

  it("bo'limlar (bolasi bor tugun) natijaga tushmaydi", () => {
    expect(idsOf(fixtureTree())).not.toContain("harakat-va-kuch");
  });

  it("bolasi yo'q tugun barg sifatida chiqadi", () => {
    // Bo'lim deb mo'ljallangan, lekin mavzulari hali import qilinmagan.
    expect(idsOf([node("bosh-bolim", { order: 1 })])).toEqual(["bosh-bolim"]);
  });

  /**
   * Bu test buzilsa daraxt har yuklashda sakrab turadi — `order` CSV'da
   * takrorlanadi va Postgres teng qiymatlarda tartibni kafolatlamaydi.
   */
  it("bir ota ichida takrorlangan `order` — `slug` bilan hal bo'ladi", () => {
    const nodes = [
      node("bolim", { order: 1 }),
      node("yangi", { parentId: "bolim", order: 5 }),
      node("avval", { parentId: "bolim", order: 5 }),
    ];

    expect(idsOf(nodes)).toEqual(["avval", "yangi"]);
  });

  it("ildizlar ham `order`, keyin `slug` bo'yicha tartiblanadi", () => {
    const nodes = [node("b-mavzu", { order: 2 }), node("a-mavzu", { order: 1 })];

    expect(idsOf(nodes)).toEqual(["a-mavzu", "b-mavzu"]);
  });

  it("yetim tugun (ota kirishda yo'q) ildiz sifatida chiqadi", () => {
    // Chaqiruvchi `grade` bo'yicha filtrlaganda ota boshqa sinfda qolishi mumkin.
    const nodes = [node("yetim", { parentId: "yoq-boshqa-sinfda", order: 1 })];

    expect(idsOf(nodes)).toEqual(["yetim"]);
  });

  it("ikki tugunli sikl — osilib qolmaydi, mavzular yo'qolmaydi", () => {
    const nodes = [
      node("a", { parentId: "b", order: 1 }),
      node("b", { parentId: "a", order: 2 }),
    ];

    expect(idsOf(nodes).sort()).toEqual(["a", "b"]);
  });

  it("bo'sh kirish — bo'sh natija", () => {
    expect(flattenTopicTree([])).toEqual([]);
  });
});

describe("chorak merosi", () => {
  it("barg `quarter` ni bo'limdan meros oladi", () => {
    const nodes = [
      node("bolim", { order: 1, quarter: 2 }),
      node("mavzu", { parentId: "bolim", order: 1 }),
    ];

    expect(flattenTopicTree(nodes)[0]?.quarter).toBe(2);
  });

  it("bargdagi o'z `quarter` i bo'limdan ustun", () => {
    const nodes = [
      node("bolim", { order: 1, quarter: 2 }),
      node("mavzu", { parentId: "bolim", order: 1, quarter: 3 }),
    ];

    expect(flattenTopicTree(nodes)[0]?.quarter).toBe(3);
  });

  it("chorak hech qayerda yo'q — `null`", () => {
    expect(flattenTopicTree(fixtureTree())[0]?.quarter).toBeNull();
  });

  it("meros faqat o'z shoxida qoladi, qo'shni bo'limga o'tmaydi", () => {
    const nodes = [
      node("bolim-1", { order: 1, quarter: 1 }),
      node("mavzu-1", { parentId: "bolim-1", order: 1 }),
      node("bolim-2", { order: 2 }),
      node("mavzu-2", { parentId: "bolim-2", order: 1 }),
    ];

    expect(flattenTopicTree(nodes).map((topic) => topic.quarter)).toEqual([1, null]);
  });
});

describe("hoursPlan", () => {
  /** 1 soat sukuti ATAYLAB bu yerda emas — u placement.ts ning qoidasi. */
  it("`hoursPlan` tegilmaydi, `undefined` esa `null` bo'ladi", () => {
    const nodes = [node("a", { order: 1, hoursPlan: 3 }), node("b", { order: 2 })];

    expect(flattenTopicTree(nodes).map((topic) => topic.hoursPlan)).toEqual([3, null]);
  });
});
