import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontekst satri — KESH KAFOLATI.
 *
 * Bir xil kirishda bir xil satr chiqmasa, Anthropic prompt keshi tushadi va
 * bitta hujjatning uch bosqichi to'liq narxda ketadi. Shuning uchun bu
 * testlar estetik emas, NARX testlari.
 *
 * Asosiy hiyla: bazadan kelgan qatorlar ARALASHTIRILIB beriladi. Postgres
 * `ORDER BY` siz tartibni kafolatlamaydi, `findMany({ id: { in } })` esa
 * ataylab tartibsiz — kod uni o'zi saralashi kerak.
 */

const mocks = vi.hoisted(() => ({
  topicFindFirst: vi.fn(),
  topicFindMany: vi.fn(),
  chunkFindMany: vi.fn(),
  embedQuery: vi.fn(),
  findSimilarChunks: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    topic: { findFirst: mocks.topicFindFirst, findMany: mocks.topicFindMany },
    sourceChunk: { findMany: mocks.chunkFindMany },
  },
}));

vi.mock("@/lib/llm", () => ({ embedQuery: mocks.embedQuery }));
vi.mock("@/lib/curriculum/search", () => ({ findSimilarChunks: mocks.findSimilarChunks }));

const TOPIC = {
  id: "t-1",
  parentId: "p-1",
  subjectId: "s-1",
  grade: 7,
  titleUz: "Tezlanish",
  objectives: ["Tezlanishni hisoblaydi", "Harakatni taqqoslaydi"],
  keywords: ["tezlanish", "harakat", "formula"],
  hoursPlan: 2,
  quarter: 1,
};

const PARENT = { parentId: null, titleUz: "Mexanika" };

const SIBLINGS = [{ titleUz: "Tezlik" }, { titleUz: "Yo'l va ko'chish" }, { titleUz: "Inersiya" }];

const CHUNKS = [
  { id: "c-b", sourceRef: "Darslik 7, 12-bet", content: "Tezlanish  —  tezlikning\r\no'zgarishi." },
  { id: "c-a", sourceRef: "Darslik 7, 11-bet", content: "Harakat turlari." },
  { id: "c-c", sourceRef: "Uslubiy qo'llanma", content: "Misol: a = (v2 - v1) / t" },
];

function shuffle<T>(items: T[]): T[] {
  return [...items].reverse();
}

/** `topic.findFirst` ham mavzuni, ham ota zanjirini qaytaradi. */
function wireTopic(): void {
  mocks.topicFindFirst.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(args.where.id === "p-1" ? PARENT : TOPIC),
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { resetContextCache } = await import("@/lib/generation/retrieval");
  resetContextCache();
});

describe("buildTopicContext — deterministiklik", () => {
  it("qatorlar ARALASHTIRILGAN holda ham bir xil satr", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();

    mocks.topicFindMany.mockResolvedValue(SIBLINGS);
    mocks.chunkFindMany.mockResolvedValue(CHUNKS);
    const first = await buildTopicContext("t-1", ["c-a", "c-b", "c-c"]);

    mocks.topicFindMany.mockResolvedValue(shuffle(SIBLINGS));
    mocks.chunkFindMany.mockResolvedValue(shuffle(CHUNKS));
    const second = await buildTopicContext("t-1", ["c-c", "c-b", "c-a"]);

    expect(second).toBe(first);
  });

  it("ketma-ket ikki chaqiruv bir xil (vaqt tamg'asi yo'q)", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue(SIBLINGS);
    mocks.chunkFindMany.mockResolvedValue(CHUNKS);

    const a = await buildTopicContext("t-1", ["c-a"]);
    const b = await buildTopicContext("t-1", ["c-a"]);
    expect(a).toBe(b);
  });

  it("satrda sana, vaqt yoki foydalanuvchi izi yo'q", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue(SIBLINGS);
    mocks.chunkFindMany.mockResolvedValue(CHUNKS);

    const text = await buildTopicContext("t-1", ["c-a"]);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/GMT|UTC|T\d{2}:\d{2}/);
  });

  it("CRLF va ketma-ket bo'shliq normallashadi", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue([]);
    mocks.chunkFindMany.mockResolvedValue([CHUNKS[0]]);

    const text = await buildTopicContext("t-1", ["c-b"]);
    expect(text).not.toContain("\r");
    expect(text).not.toMatch(/ {2}/);
  });

  it("mazmun satrga tushadi", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue(SIBLINGS);
    mocks.chunkFindMany.mockResolvedValue(CHUNKS);

    const text = await buildTopicContext("t-1", ["c-a", "c-b", "c-c"]);
    expect(text).toContain("Mexanika");
    expect(text).toContain("Tezlanish");
    expect(text).toContain("7-sinf");
    expect(text).toContain("Tezlanishni hisoblaydi");
    expect(text).toContain("Darslik 7, 12-bet");
  });

  it("kalit so'zlar va qardoshlar SARALANGAN", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue(SIBLINGS);
    mocks.chunkFindMany.mockResolvedValue([]);

    const text = await buildTopicContext("t-1", []);
    // Import tartibi "tezlanish, harakat, formula" edi.
    expect(text).toContain("Kalit so'zlar: formula, harakat, tezlanish");
    expect(text).toContain("Qo'shni mavzular: Inersiya; Tezlik; Yo'l va ko'chish");
  });

  it("mavzu topilmasa bo'sh satr", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    mocks.topicFindFirst.mockResolvedValue(null);
    expect(await buildTopicContext("yo-q", [])).toBe("");
  });

  it("bo'lak ro'yxati bo'sh bo'lsa bazaga umuman bormaydi", async () => {
    const { buildTopicContext } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.topicFindMany.mockResolvedValue([]);

    await buildTopicContext("t-1", []);
    expect(mocks.chunkFindMany).not.toHaveBeenCalled();
  });
});

describe("resolveContextChunks — muzlatilgan tanlov", () => {
  it("similarity bo'yicha saralab 8 tasini oladi va id bo'yicha tartiblaydi", async () => {
    const { resolveContextChunks } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockResolvedValue([0.1, 0.2]);

    const matches = Array.from({ length: 12 }, (_, i) => ({
      id: `c-${String(i).padStart(2, "0")}`,
      similarity: 1 - i * 0.01,
    }));
    mocks.findSimilarChunks.mockResolvedValue(matches);

    const ids = await resolveContextChunks("t-1");
    expect(ids).toHaveLength(8);
    // Eng o'xshash 8 tasi, KEYIN id bo'yicha saralangan.
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain("c-00");
    expect(ids).not.toContain("c-11");
  });

  it("teng similarity da id bo'yicha TO'LIQ tartib — natija barqaror", async () => {
    const { resolveContextChunks, resetContextCache } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockResolvedValue([0.1]);

    const tied = [
      { id: "c-3", similarity: 0.5 },
      { id: "c-1", similarity: 0.5 },
      { id: "c-2", similarity: 0.5 },
    ];

    mocks.findSimilarChunks.mockResolvedValue(tied);
    const first = await resolveContextChunks("t-1");

    resetContextCache();
    // HNSW tartibni kafolatlamaydi — aralashtirib beramiz.
    mocks.findSimilarChunks.mockResolvedValue(shuffle(tied));
    const second = await resolveContextChunks("t-1");

    expect(second).toEqual(first);
  });

  it("float shovqini tartibni ag'darmaydi", async () => {
    const { resolveContextChunks, resetContextCache } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockResolvedValue([0.1]);

    mocks.findSimilarChunks.mockResolvedValue([
      { id: "c-1", similarity: 0.8000000001 },
      { id: "c-2", similarity: 0.8 },
    ]);
    const first = await resolveContextChunks("t-1");

    resetContextCache();
    mocks.findSimilarChunks.mockResolvedValue([
      { id: "c-2", similarity: 0.8000000002 },
      { id: "c-1", similarity: 0.7999999999 },
    ]);
    const second = await resolveContextChunks("t-1");

    expect(second).toEqual(first);
  });

  it("kesh: ikkinchi chaqiruvda embedQuery QAYTA chaqirilmaydi", async () => {
    const { resolveContextChunks } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockResolvedValue([0.1]);
    mocks.findSimilarChunks.mockResolvedValue([{ id: "c-1", similarity: 0.9 }]);

    await resolveContextChunks("t-1");
    await resolveContextChunks("t-1");
    expect(mocks.embedQuery).toHaveBeenCalledTimes(1);
  });

  it("kesh PROMISE saqlaydi — parallel chaqiruvda stampede yo'q", async () => {
    const { resolveContextChunks } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockResolvedValue([0.1]);
    mocks.findSimilarChunks.mockResolvedValue([{ id: "c-1", similarity: 0.9 }]);

    await Promise.all([resolveContextChunks("t-1"), resolveContextChunks("t-1")]);
    expect(mocks.embedQuery).toHaveBeenCalledTimes(1);
  });

  it("xato keshda QOLMAYDI — keyingi so'rov qayta urinadi", async () => {
    const { resolveContextChunks } = await import("@/lib/generation/retrieval");
    wireTopic();
    mocks.embedQuery.mockRejectedValueOnce(new Error("embedding yiqildi"));

    await expect(resolveContextChunks("t-1")).rejects.toThrow("embedding yiqildi");

    mocks.embedQuery.mockResolvedValue([0.1]);
    mocks.findSimilarChunks.mockResolvedValue([{ id: "c-1", similarity: 0.9 }]);
    expect(await resolveContextChunks("t-1")).toEqual(["c-1"]);
  });

  it("mavzu topilmasa bo'sh ro'yxat, embedding chaqirilmaydi", async () => {
    const { resolveContextChunks } = await import("@/lib/generation/retrieval");
    mocks.topicFindFirst.mockResolvedValue(null);
    expect(await resolveContextChunks("yo-q")).toEqual([]);
    expect(mocks.embedQuery).not.toHaveBeenCalled();
  });
});
