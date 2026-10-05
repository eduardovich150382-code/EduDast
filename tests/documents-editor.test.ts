import { describe, expect, it } from "vitest";
import { Block, BLOCK_TYPES, DocumentContent, blockId } from "@/lib/documents/blocks";
import { newBlock } from "@/lib/documents/editor-defaults";
import { newBlockId, takenIds } from "@/lib/documents/editor-ids";
import type { DefaultLabels } from "@/lib/documents/editor-labels";
import {
  appendBlock,
  duplicateBlock,
  moveBlock,
  omitKey,
  removeBlock,
  replaceBlock,
} from "@/lib/documents/editor-ops";
import { withQuestionKind, type QuestionKind } from "@/lib/documents/editor-question";
import { contentIssues } from "@/lib/documents/editor-validity";

/**
 * Muharrirning sof mantiqi (docs/sessions/13-muharrir.md).
 *
 * Bu faylning MARKAZIY da'vosi: muharrir yasagan HAR SHAKL `blocks.ts`
 * sxemasiga mos (7-band). Sxema saqlash shartnomasi, shuning uchun test
 * uni yumshatmaydi — muharrir sxemaga moslashadi.
 */

const LABELS: DefaultLabels = {
  heading: "Sarlavha",
  text: "Matn",
  item: "Band",
  question: "Savol",
  answer: "Javob",
  option: "Variant",
  column: "Ustun",
  stage: "Bosqich",
  criterion: "Mezon",
  pairLeft: "Chap",
  pairRight: "O'ng",
};

const KINDS: readonly QuestionKind[] = ["mcq", "short", "truefalse", "match"];

function question(id: string) {
  const block = newBlock("question", id, LABELS, []);
  if (block === null || block.type !== "question") throw new Error("savol yasalmadi");
  return block;
}

/** Ikki paragrafli oddiy kontent — amallar ustida tajriba uchun. */
function content(): DocumentContent {
  return {
    v: 1,
    blocks: [
      { id: "b1", type: "paragraph", text: "Birinchi" },
      { id: "b2", type: "paragraph", text: "Ikkinchi" },
      { id: "b3", type: "paragraph", text: "Uchinchi" },
    ],
  };
}

describe("newBlockId", () => {
  it("`e` bilan boshlanadi va 64 belgidan oshmaydi", () => {
    const id = newBlockId(new Set());
    expect(id.startsWith("e")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("`blockId()` yasagan id bilan to'qnashmaydi", () => {
    // Generatsiya id lari `s…` bilan boshlanadi, muharrir id lari `e…`.
    expect(blockId("1", "paragraph", 0).startsWith("e")).toBe(false);
  });

  it("band id ni qaytarmaydi", () => {
    const first = newBlockId(new Set());
    const second = newBlockId(new Set([first]));
    expect(second).not.toBe(first);
  });

  it("ketma-ket chaqiruvlar ayni millisekundda ham turli id beradi", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const id = newBlockId(taken);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
    expect(taken.size).toBe(50);
  });

  it("takenIds kontentdagi id larni yig'adi", () => {
    expect(takenIds(content().blocks)).toEqual(new Set(["b1", "b2", "b3"]));
  });
});

describe("newBlock", () => {
  // ENG MUHIM TEST: yangi blok tug'ilgan zahoti valid bo'lmasa, "blok
  // qo'shish" amali butun hujjatning avtosaqlashini to'xtatardi.
  it.each(BLOCK_TYPES.filter((type) => type !== "answerKey"))(
    "%s standart qiymati sxemadan o'tadi",
    (type) => {
      const block = newBlock(type, "new-1", LABELS, []);
      expect(block).not.toBeNull();
      const parsed = Block.safeParse(block);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
    },
  );

  it("answerKey savolsiz hujjatda null qaytaradi", () => {
    expect(newBlock("answerKey", "new-1", LABELS, [])).toBeNull();
  });

  it("answerKey mavjud savollardan urug'lanadi va sxemadan o'tadi", () => {
    const q = question("q1");
    const block = newBlock("answerKey", "new-1", LABELS, [q]);
    expect(Block.safeParse(block).success).toBe(true);
    if (block?.type !== "answerKey") throw new Error("answerKey emas");
    expect(block.items).toEqual([{ questionId: "q1", answer: q.answer }]);
  });

  it("stages ikki bosqich bilan tug'iladi (min(2) sharti)", () => {
    const block = newBlock("stages", "new-1", LABELS, []);
    if (block?.type !== "stages") throw new Error("stages emas");
    expect(block.items).toHaveLength(2);
  });

  it("table satr kengligi sarlavhalar soniga teng", () => {
    const block = newBlock("table", "new-1", LABELS, []);
    if (block?.type !== "table") throw new Error("table emas");
    for (const row of block.rows) expect(row).toHaveLength(block.headers.length);
  });

  it("question `pairs` ni BUTUNLAY tashlab ketadi", () => {
    // `pairs: undefined` ham yaramaydi: `strictObject` uchun mavjud kalit
    // "berilgan" hisoblanadi (`blocks.ts:192`).
    expect("pairs" in question("q1")).toBe(false);
  });
});

describe("withQuestionKind", () => {
  it.each(KINDS.flatMap((from) => KINDS.map((to) => [from, to] as const)))(
    "%s -> %s valid savol beradi",
    (from, to) => {
      const start = withQuestionKind(question("q1"), from, LABELS);
      const next = withQuestionKind(start, to, LABELS);
      const parsed = Block.safeParse(next);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(next.kind).toBe(to);
    },
  );

  it("mcq da javob variantlar ichida bo'ladi", () => {
    const mcq = withQuestionKind(question("q1"), "mcq", LABELS);
    expect(new Set(mcq.options).size).toBeGreaterThanOrEqual(3);
    expect(mcq.options).toContain(mcq.answer);
  });

  it("mcq dan chiqqanda variantlar tozalanadi", () => {
    const mcq = withQuestionKind(question("q1"), "mcq", LABELS);
    expect(withQuestionKind(mcq, "truefalse", LABELS).options).toEqual([]);
    expect(withQuestionKind(mcq, "match", LABELS).options).toEqual([]);
  });

  it("match dan chiqqanda pairs kaliti BUTUNLAY ketadi", () => {
    const match = withQuestionKind(question("q1"), "match", LABELS);
    expect(match.pairs).toHaveLength(2);
    expect("pairs" in withQuestionKind(match, "short", LABELS)).toBe(false);
  });

  it("o'qituvchi yozgan variantlarni mcq ga o'tganda saqlaydi", () => {
    const base = { ...question("q1"), options: ["Alfa", "Beta"] };
    const mcq = withQuestionKind(base, "mcq", LABELS);
    expect(mcq.options.slice(0, 2)).toEqual(["Alfa", "Beta"]);
    expect(mcq.options).toHaveLength(3);
  });
});

describe("blok amallari", () => {
  it("replaceBlock faqat ko'rsatilgan blokni almashtiradi", () => {
    const next = replaceBlock(content(), 1, { id: "b2", type: "paragraph", text: "Yangi" });
    expect(next.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(DocumentContent.safeParse(next).success).toBe(true);
    if (next.blocks[1]?.type !== "paragraph") throw new Error("paragraph emas");
    expect(next.blocks[1].text).toBe("Yangi");
  });

  it("removeBlock blokni o'chiradi", () => {
    const next = removeBlock(content(), 0);
    expect(next.blocks.map((b) => b.id)).toEqual(["b2", "b3"]);
    expect(DocumentContent.safeParse(next).success).toBe(true);
  });

  it("moveBlock o'rin almashtiradi", () => {
    expect(moveBlock(content(), 0, 1).blocks.map((b) => b.id)).toEqual(["b2", "b1", "b3"]);
    expect(moveBlock(content(), 2, -1).blocks.map((b) => b.id)).toEqual(["b1", "b3", "b2"]);
  });

  it("moveBlock chegarada kontentni o'zgartirmaydi", () => {
    const base = content();
    expect(moveBlock(base, 0, -1).blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(moveBlock(base, 2, 1).blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("duplicateBlock nusxani orqasiga qo'yadi va takroriy id yasamaydi", () => {
    const base = content();
    const next = duplicateBlock(base, 0, newBlockId(takenIds(base.blocks)));
    expect(next.blocks).toHaveLength(4);
    expect(next.blocks[1]?.id).not.toBe("b1");
    // Takroriy-id refine'i (`blocks.ts:301`) yiqilmasligi SHART.
    expect(DocumentContent.safeParse(next).success).toBe(true);
  });

  it("duplicateBlock chuqur nusxa oladi", () => {
    // Sayoz nusxa ikki blokni bitta massivga bog'lab qo'yardi va birini
    // tahrirlash ikkinchisini ham o'zgartirardi.
    const stages = newBlock("stages", "s1", LABELS, []);
    if (stages?.type !== "stages") throw new Error("stages emas");
    const next = duplicateBlock({ v: 1, blocks: [stages] }, 0, "e-copy");
    const copy = next.blocks[1];
    if (copy?.type !== "stages") throw new Error("nusxa stages emas");
    expect(copy.items).not.toBe(stages.items);
    expect(copy.items[0]).not.toBe(stages.items[0]);
  });

  it("appendBlock oxiriga qo'shadi", () => {
    const base = content();
    const block = newBlock("note", "e-new", LABELS, []);
    if (block === null) throw new Error("note yasalmadi");
    const next = appendBlock(base, block);
    expect(next.blocks.at(-1)?.id).toBe("e-new");
    expect(DocumentContent.safeParse(next).success).toBe(true);
  });

  it("amallar asl kontentni o'zgartirmaydi", () => {
    const base = content();
    removeBlock(base, 0);
    moveBlock(base, 0, 1);
    appendBlock(base, { id: "x", type: "paragraph", text: "X" });
    expect(base.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("omitKey ixtiyoriy kalitni BUTUNLAY tashlaydi", () => {
    // `undefined` qilib qo'yish yetarli EMAS: `strictObject` uchun mavjud
    // kalit `undefined` bilan ham "berilgan" hisoblanadi.
    const table = newBlock("table", "t1", LABELS, []);
    if (table?.type !== "table") throw new Error("table emas");
    const withCaption = { ...table, caption: "Nom" };

    const without = omitKey(withCaption, "caption");
    expect("caption" in without).toBe(false);
    expect(Block.safeParse(without).success).toBe(true);
    // Asl obyekt tegilmaydi.
    expect(withCaption.caption).toBe("Nom");
  });

  it("omitKey savol `pairs` ini tashlaganda sxema o'tadi", () => {
    const match = withQuestionKind(question("q1"), "match", LABELS);
    const dropped = { ...omitKey(match, "pairs"), kind: "short" as const, options: [] };
    expect(Block.safeParse(dropped).success).toBe(true);
  });

  it("chegaradan chiqqan indeks jim qaytaradi", () => {
    const base = content();
    expect(replaceBlock(base, 9, { id: "z", type: "paragraph", text: "Z" })).toBe(base);
    expect(removeBlock(base, -1)).toBe(base);
    expect(duplicateBlock(base, 9, "e-1")).toBe(base);
  });
});

describe("contentIssues", () => {
  it("sog'lom kontentda null", () => {
    expect(contentIssues(content())).toBeNull();
  });

  it("bo'sh matnli blokni O'Z id si bilan belgilaydi", () => {
    const broken: DocumentContent = {
      v: 1,
      blocks: [
        { id: "b1", type: "paragraph", text: "Butun" },
        { id: "b2", type: "paragraph", text: "" },
      ],
    };
    const issues = contentIssues(broken);
    expect(issues?.blockIds).toEqual(new Set(["b2"]));
    expect(issues?.document).toBe(false);
  });

  it("nosog'lom savolni belgilaydi", () => {
    // mcq, lekin bitta variant — `superRefine` ikki marta yiqiladi.
    const broken: DocumentContent = {
      v: 1,
      blocks: [{ ...question("q1"), kind: "mcq", options: ["Yolg'iz"], answer: "Boshqa" }],
    };
    expect(contentIssues(broken)?.blockIds).toEqual(new Set(["q1"]));
  });

  it("takroriy id hujjat darajasida belgilanadi", () => {
    const broken: DocumentContent = {
      v: 1,
      blocks: [
        { id: "bir", type: "paragraph", text: "A" },
        { id: "bir", type: "paragraph", text: "B" },
      ],
    };
    const issues = contentIssues(broken);
    expect(issues?.document).toBe(true);
    expect(issues?.blockIds.size).toBe(0);
  });
});
