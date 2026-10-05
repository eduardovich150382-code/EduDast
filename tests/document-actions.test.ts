import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentContent } from "@/lib/documents/blocks";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * server/document-actions.ts (docs/sessions/13-muharrir.md, 4- va 7-band +
 * CLAUDE.md 8-qoida: har server action = yangi vitest testi).
 *
 * `tests/class-actions.test.ts` naqshi: `vi.hoisted` mock to'plami, qo'lda
 * yasalgan qisman Prisma stub'i, va `calls` massivi — u auth BIRINCHI await
 * ekanini isbotlaydi (layout server action POST'ini himoya qilmaydi).
 *
 * Prisma stub'ida `document.delete` ATAYLAB YO'Q: hard delete urinishi
 * "is not a function" bilan yiqilsin (baza qoidasi — faqat `deletedAt`).
 */

const SESSION_USER = {
  id: "user-1",
  fullName: "Test",
  username: null,
  role: "TEACHER",
  region: "andijon",
  subjects: ["fizika"],
  grades: [7],
  locale: "uz",
  creditBalance: 0,
  creditsHeld: 0,
  sessionVersion: 5,
};

/** To'g'ri kontent — har test uni kerakli joyida buzadi. */
const CONTENT: DocumentContent = {
  v: 1,
  blocks: [
    { id: "s1-heading-0", type: "heading", level: 1, text: "Nyuton qonunlari" },
    { id: "e123", type: "paragraph", text: "Muharrirda qo'shilgan paragraf." },
  ],
};

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  documentUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: { document: { updateMany: mocks.documentUpdateMany } },
}));

let calls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  mocks.requireAuth.mockImplementation(async () => {
    calls.push("requireAuth");
    return { ...SESSION_USER };
  });
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
});

function actions() {
  return import("@/server/document-actions");
}

/** Oxirgi `updateMany` ga berilgan argument. */
function payload(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  const call = mocks.documentUpdateMany.mock.calls[0]?.[0];
  if (call === undefined) throw new Error("updateMany chaqirilmadi");
  return call as { where: Record<string, unknown>; data: Record<string, unknown> };
}

describe("auth har action'da birinchi", () => {
  it.each([
    ["saveDocument", {}],
    ["renameDocument", {}],
    ["deleteDocument", {}],
  ] as const)("%s — axlat kirishda ham avval auth", async (name, input) => {
    const mod = await actions();
    const result = await mod[name](input);

    expect(result).toEqual({ ok: false, error: "invalid" });
    // Auth YAGONA bajarilgan qadam: Zod rad etishdan OLDIN.
    expect(calls).toEqual(["requireAuth"]);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["saveDocument", "renameDocument", "deleteDocument"] as const)(
    "%s — auth rad etsa hech narsa yozilmaydi",
    async (name) => {
      mocks.requireAuth.mockRejectedValue(new Error("REDIRECT"));
      const mod = await actions();

      await expect(mod[name]({ id: "doc-1" })).rejects.toThrow("REDIRECT");
      expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("saveDocument", () => {
  it("to'g'ri kontentni saqlaydi", async () => {
    const { saveDocument } = await actions();
    expect(await saveDocument({ id: "doc-1", content: CONTENT })).toEqual({ ok: true });
    expect(payload().data.contentJson).toEqual(CONTENT);
  });

  it.each([
    ["noma'lum blok turi", { v: 1, blocks: [{ id: "b1", type: "qwe", text: "A" }] }],
    ["sxemadan tashqari kalit", { v: 1, blocks: [{ id: "b1", type: "paragraph", text: "A", x: 1 }] }],
    ["bo'sh matn", { v: 1, blocks: [{ id: "b1", type: "paragraph", text: "" }] }],
    ["takroriy id", { v: 1, blocks: [
      { id: "b1", type: "paragraph", text: "A" },
      { id: "b1", type: "paragraph", text: "B" },
    ] }],
    ["boshqa versiya", { v: 2, blocks: [] }],
    ["kontent yo'q", undefined],
  ])("%s rad etiladi", async (_name, content) => {
    const { saveDocument } = await actions();
    expect(await saveDocument({ id: "doc-1", content })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("hajm shifti oshsa rad etiladi", async () => {
    // 60 x 4000 belgi = 240 000 > MAX_PAYLOAD_CHARS, lekin sxema bo'yicha
    // to'liq valid (400 blokdan kam, har matn 4000 dan oshmaydi).
    const blocks = Array.from({ length: 60 }, (_, i) => ({
      id: `b${String(i)}`,
      type: "paragraph" as const,
      text: "a".repeat(4_000),
    }));
    const { saveDocument } = await actions();

    expect(await saveDocument({ id: "doc-1", content: { v: 1, blocks } })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("BOSHQA foydalanuvchining hujjatini saqlab bo'lmaydi", async () => {
    mocks.documentUpdateMany.mockResolvedValue({ count: 0 });
    const { saveDocument } = await actions();

    expect(await saveDocument({ id: "boshqa-doc", content: CONTENT })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    // Egalik `where` ICHIDA — oldindan `findFirst` bilan emas.
    expect(payload().where.userId).toBe("user-1");
    expect(payload().where.deletedAt).toBeNull();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("generatsiya ketayotgan hujjat `where` bilan chetlanadi", async () => {
    const { saveDocument } = await actions();
    await saveDocument({ id: "doc-1", content: CONTENT });

    // QUEUED/RUNNING kirmaydi: `commitStage` ning `jsonb ||` append'i bilan
    // poyga bo'lmasin. FAILED esa ataylab kiradi.
    expect(payload().where.status).toEqual({ in: ["DONE", "FAILED"] });
  });

  it("eskirgan sifat ballini tozalaydi", async () => {
    const { saveDocument } = await actions();
    await saveDocument({ id: "doc-1", content: CONTENT });

    expect(payload().data.qualityScore).toBeNull();
    // `Json?` ustunda SQL NULL `Prisma.DbNull` orqali yoziladi — oddiy
    // `null` ni Prisma TS darajasida rad etadi.
    expect(payload().data.qualityNotes).toBe(Prisma.DbNull);
  });
});

describe("renameDocument", () => {
  it("sarlavhani o'zgartiradi va bo'shliqni kesadi", async () => {
    const { renameDocument } = await actions();
    expect(await renameDocument({ id: "doc-1", title: "  Yangi nom  " })).toEqual({
      ok: true,
    });
    expect(payload().data.title).toBe("Yangi nom");
  });

  it.each([
    ["bo'sh sarlavha", ""],
    ["faqat bo'shliq", "   "],
    ["juda uzun", "a".repeat(201)],
  ])("%s rad etiladi", async (_name, title) => {
    const { renameDocument } = await actions();
    expect(await renameDocument({ id: "doc-1", title })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("BOSHQA foydalanuvchining hujjatini nomlab bo'lmaydi", async () => {
    mocks.documentUpdateMany.mockResolvedValue({ count: 0 });
    const { renameDocument } = await actions();

    expect(await renameDocument({ id: "boshqa-doc", title: "Nom" })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    expect(payload().where.userId).toBe("user-1");
    expect(payload().where.deletedAt).toBeNull();
  });
});

describe("deleteDocument", () => {
  it("HARD DELETE qilmaydi — faqat `deletedAt`", async () => {
    const { deleteDocument } = await actions();
    expect(await deleteDocument({ id: "doc-1" })).toEqual({ ok: true });

    // `prisma.document.delete` stub'da yo'q, ya'ni chaqirilsa shu test
    // "is not a function" bilan yiqilardi.
    expect(payload().where).toEqual({ id: "doc-1", userId: "user-1", deletedAt: null });
    expect(payload().data.deletedAt).toBeInstanceOf(Date);
  });

  it("allaqachon o'chirilgan hujjat topilmaydi", async () => {
    mocks.documentUpdateMany.mockResolvedValue({ count: 0 });
    const { deleteDocument } = await actions();

    expect(await deleteDocument({ id: "doc-1" })).toEqual({
      ok: false,
      error: "topilmadi",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revalidatePath", () => {
  it("uchala yo'l, hammasi `page`", async () => {
    const { saveDocument } = await actions();
    await saveDocument({ id: "doc-1", content: CONTENT });

    expect(mocks.revalidatePath.mock.calls.map((call) => call[0])).toEqual([
      "/[locale]/ish",
      "/[locale]/ish/hujjatlar",
      "/[locale]/ish/hujjat/[id]",
    ]);
    expect(mocks.revalidatePath.mock.calls.every((call) => call[1] === "page")).toBe(true);
  });
});

describe("kutilmagan xato yashirilmaydi", () => {
  it.each(["saveDocument", "renameDocument", "deleteDocument"] as const)(
    "%s — Prisma xatosi yuqoriga otiladi",
    async (name) => {
      mocks.documentUpdateMany.mockRejectedValue(new Error("tarmoq uzildi"));
      const mod = await actions();
      const input =
        name === "saveDocument"
          ? { id: "doc-1", content: CONTENT }
          : name === "renameDocument"
            ? { id: "doc-1", title: "Nom" }
            : { id: "doc-1" };

      await expect(mod[name](input)).rejects.toThrow("tarmoq uzildi");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
