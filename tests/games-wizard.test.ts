import { describe, expect, it } from "vitest";
import { creditCost, GAME_LIMITS } from "@/lib/credits/cost-table";
import { documentTypeFor, readTypeParam, typeParamFor } from "@/lib/documents/type-param";
import { paramForGameKind } from "@/lib/games/registry";
import { GAME_KINDS } from "@/lib/games/types";
import { startSchema } from "@/lib/generation/start-input";
import { stageLabelInputFromDocument, stageLabels } from "@/lib/generation/stage-labels";
import {
  clampItemCount,
  confirmQuery,
  defaultItemCount,
  GAME_ITEM_COUNTS,
  itemCountAllowed,
  parseWizardParams,
  paramsCompleteForType,
  resolveParams,
  startInputFor,
  wizardQuery,
  wizardQueryFromDocument,
} from "@/lib/generation/wizard-params";

/**
 * Sehrgarning o'yin yo'li.
 *
 * Sehrgar holati URL'da yashaydi, ya'ni o'qituvchi uni qo'lda tahrirlashi
 * yoki eski havolani yuborishi mumkin. Asosiy da'vo bitta: har qanday
 * kirishda parser throw qilmaydi va narxlanadigan holat qaytaradi.
 */

describe("URL taxallusi", () => {
  it("oyin -> GAME", () => {
    expect(readTypeParam("oyin")).toBe("oyin");
    expect(documentTypeFor("oyin")).toBe("GAME");
    expect(typeParamFor("GAME")).toBe("oyin");
  });
});

describe("GAME_ITEM_COUNTS", () => {
  it.each(GAME_KINDS)("%s variantlari chegara ichida", (kind) => {
    const { min, max } = GAME_LIMITS[kind];
    expect(GAME_ITEM_COUNTS[kind].length).toBeGreaterThan(0);
    for (const count of GAME_ITEM_COUNTS[kind]) {
      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
    }
  });

  it("g'ildirakda bitta variant", () => {
    // Sektor soni qat'iy 8 — forma u yerda element tanlovini ko'rsatmaydi.
    expect(GAME_ITEM_COUNTS.wheel).toEqual([8]);
  });

  it.each(GAME_KINDS)("%s default i ro'yxatda bor", (kind) => {
    expect(GAME_ITEM_COUNTS[kind]).toContain(defaultItemCount(kind));
  });
});

describe("clampItemCount", () => {
  it("ro'yxatdagi sonni saqlaydi", () => {
    expect(clampItemCount("word-search", 10)).toBe(10);
  });

  it.each([null, 0, 1, 99, 7, -5, 1.5])("%s -> default", (value) => {
    // `?element=99` narxsiz ekran yasamasin.
    expect(clampItemCount("word-search", value)).toBe(defaultItemCount("word-search"));
  });

  it("boshqa kind ning soni qabul qilinmaydi", () => {
    // Anagrammada 6 bor, so'z qidirishda yo'q.
    expect(itemCountAllowed("anagram", 6)).toBe(true);
    expect(itemCountAllowed("word-search", 6)).toBe(false);
    expect(clampItemCount("word-search", 6)).toBe(defaultItemCount("word-search"));
  });
});

describe("parseWizardParams — o'yin", () => {
  it("to'liq havolani o'qiydi", () => {
    const params = parseWizardParams({
      tur: "oyin",
      oyin: "soz-qidirish",
      element: "12",
      mavzu: "topic-1",
    });
    expect(params.type).toBe("oyin");
    expect(params.gameKind).toBe("word-search");
    expect(params.itemCount).toBe(12);
  });

  it("noma'lum o'yin turi tashlanadi", () => {
    for (const value of ["krossvord", "wheel", "", "constructor", "__proto__"]) {
      expect(parseWizardParams({ oyin: value }).gameKind, value).toBeNull();
    }
  });

  it("kind siz element QABUL QILINMAYDI", () => {
    // `kind` ma'lum bo'lmasa sonning to'g'riligini tekshirib bo'lmaydi.
    expect(parseWizardParams({ element: "12" }).itemCount).toBeNull();
  });

  it("kind ga mos kelmagan element tashlanadi", () => {
    // G'ildirakka o'tganda 14 so'zlik tanlov qolib ketmasin.
    const params = parseWizardParams({ oyin: "gildirak", element: "14" });
    expect(params.gameKind).toBe("wheel");
    expect(params.itemCount).toBeNull();
  });

  it("buzuq element throw qilmaydi", () => {
    for (const value of ["abc", "", "-1", "1e9", "NaN", "12.5"]) {
      expect(() => parseWizardParams({ oyin: "soz-qidirish", element: value })).not.toThrow();
    }
  });
});

describe("paramsCompleteForType — o'yin", () => {
  const base = parseWizardParams({ tur: "oyin", mavzu: "topic-1" });

  it("kind siz to'liq emas", () => {
    expect(paramsCompleteForType(base)).toBe(false);
  });

  it("g'ildirakda element SO'RALMAYDI", () => {
    // Sektor soni qat'iy, ya'ni bo'sh parametr ekrani ma'nosiz bo'lardi.
    const params = parseWizardParams({ tur: "oyin", oyin: "gildirak", mavzu: "topic-1" });
    expect(paramsCompleteForType(params)).toBe(true);
  });

  it("so'z qidirishda element kerak", () => {
    const withoutCount = parseWizardParams({
      tur: "oyin",
      oyin: "soz-qidirish",
      mavzu: "topic-1",
    });
    expect(paramsCompleteForType(withoutCount)).toBe(false);

    const withCount = parseWizardParams({
      tur: "oyin",
      oyin: "soz-qidirish",
      element: "10",
      mavzu: "topic-1",
    });
    expect(paramsCompleteForType(withCount)).toBe(true);
  });
});

describe("resolveParams — o'yin", () => {
  it("tanlanmagan holatda default beradi", () => {
    const resolved = resolveParams(parseWizardParams({ tur: "oyin" }));
    expect(resolved.type).toBe("GAME");
    if (resolved.type !== "GAME") throw new Error("type");
    expect(GAME_KINDS).toContain(resolved.gameKind);
    expect(itemCountAllowed(resolved.gameKind, resolved.itemCount)).toBe(true);
  });

  it.each(GAME_KINDS)("%s uchun narxlanadigan son beradi", (kind) => {
    const resolved = resolveParams(
      parseWizardParams({ tur: "oyin", oyin: paramForGameKind(kind) }),
    );
    if (resolved.type !== "GAME") throw new Error("type");
    expect(resolved.gameKind).toBe(kind);
    expect(itemCountAllowed(kind, resolved.itemCount)).toBe(true);
    expect(creditCost({ type: "GAME", gameKind: kind, itemCount: resolved.itemCount }))
      .toBeGreaterThan(0);
  });
});

describe("startInputFor — o'yin", () => {
  it.each(GAME_KINDS)("%s uchun startSchema dan o'tadi", (kind) => {
    const params = parseWizardParams({ tur: "oyin", oyin: paramForGameKind(kind) });
    const input = startInputFor(params, "topic-1");
    const parsed = startSchema.safeParse(input);
    expect(parsed.error?.issues ?? [], kind).toEqual([]);
  });

  it("har element varianti startSchema dan o'tadi", () => {
    for (const kind of GAME_KINDS) {
      for (const count of GAME_ITEM_COUNTS[kind]) {
        const params = parseWizardParams({
          tur: "oyin",
          oyin: paramForGameKind(kind),
          element: String(count),
        });
        const parsed = startSchema.safeParse(startInputFor(params, "topic-1"));
        expect(parsed.error?.issues ?? [], `${kind}/${String(count)}`).toEqual([]);
      }
    }
  });
});

describe("startSchema — GAME chegarasi kind ga bog'liq", () => {
  it("g'ildirakda 8 dan boshqa son rad etiladi", () => {
    // Tekis chegara qo'yilsa 6 sektorli g'ildirak so'ralishi mumkin
    // bo'lardi va `WheelContent.length(8)` generatsiyaning OXIRIDA
    // yiqilardi — kredit band qilingandan keyin.
    for (const itemCount of [6, 7, 9, 12]) {
      const parsed = startSchema.safeParse({
        type: "GAME",
        topicId: "topic-1",
        gameKind: "wheel",
        itemCount,
      });
      expect(parsed.success, String(itemCount)).toBe(false);
    }
    expect(
      startSchema.safeParse({
        type: "GAME",
        topicId: "topic-1",
        gameKind: "wheel",
        itemCount: 8,
      }).success,
    ).toBe(true);
  });

  it.each(GAME_KINDS)("%s chegarasidan tashqari son rad etiladi", (gameKind) => {
    const { min, max } = GAME_LIMITS[gameKind];
    for (const itemCount of [min - 1, max + 1]) {
      const parsed = startSchema.safeParse({
        type: "GAME",
        topicId: "topic-1",
        gameKind,
        itemCount,
      });
      expect(parsed.success, `${gameKind}/${String(itemCount)}`).toBe(false);
    }
  });
});

describe("URL qurish — o'yin", () => {
  it("wizardQuery o'yin parametrlarini yozadi", () => {
    const params = parseWizardParams({
      tur: "oyin",
      oyin: "anagramma",
      element: "10",
    });
    const query = wizardQuery(params);
    expect(query.tur).toBe("oyin");
    expect(query.oyin).toBe("anagramma");
    expect(query.element).toBe("10");
  });

  it("confirmQuery BOSHQA turning parametrlarini tozalaydi", () => {
    // Ulashilgan havolada eski tanlov qolib ketsa `parseWizardParams` uni
    // qaytib o'qib qadamni noto'g'ri hisoblardi.
    const params = parseWizardParams({
      tur: "oyin",
      oyin: "anagramma",
      element: "10",
      daqiqa: "45",
      savol: "10",
      slayd: "12",
    });
    const query = confirmQuery(params);
    expect(query.qadam).toBe("tasdiq");
    expect(query.oyin).toBe("anagramma");
    expect(query.daqiqa).toBeUndefined();
    expect(query.savol).toBeUndefined();
    expect(query.slayd).toBeUndefined();
  });

  it("boshqa turlarning confirmQuery si o'yin parametrini tozalaydi", () => {
    const params = parseWizardParams({
      tur: "taqdimot",
      slayd: "12",
      oyin: "anagramma",
      element: "10",
    });
    const query = confirmQuery(params);
    expect(query.oyin).toBeUndefined();
    expect(query.element).toBeUndefined();
  });

  it("wizardQueryFromDocument saqlangan tanlovni qaytaradi", () => {
    const query = wizardQueryFromDocument({
      type: "GAME",
      topicId: "topic-1",
      inputParams: { gameKind: "anagram", itemCount: 10 },
    });
    expect(query.tur).toBe("oyin");
    expect(query.oyin).toBe("anagramma");
    expect(query.element).toBe("10");
    expect(query.qadam).toBe("tasdiq");
  });

  it("wizardQueryFromDocument buzuq inputParams da ham ishlaydi", () => {
    for (const inputParams of [null, {}, { gameKind: "krossvord" }, { itemCount: 99 }, "matn"]) {
      const query = wizardQueryFromDocument({
        type: "GAME",
        topicId: "topic-1",
        inputParams,
      });
      expect(query.tur).toBe("oyin");
      expect(query.mavzu).toBe("topic-1");
    }
  });

  it("chegaradan tashqari saqlangan son tashlanadi", () => {
    const query = wizardQueryFromDocument({
      type: "GAME",
      topicId: "topic-1",
      inputParams: { gameKind: "anagram", itemCount: 99 },
    });
    expect(query.element).toBeUndefined();
  });
});

describe("stage-labels — o'yin", () => {
  it("bitta qator beradi", () => {
    expect(stageLabels({ type: "GAME" })).toHaveLength(1);
  });

  it("inputParams O'QILMAYDI", () => {
    // Reja bitta bosqichli, ya'ni buzuq parametrlar qator sonini
    // o'zgartirmaydi.
    for (const inputParams of [null, {}, "matn", { itemCount: 99 }]) {
      expect(stageLabelInputFromDocument("GAME", inputParams)).toEqual({ type: "GAME" });
    }
  });
});
