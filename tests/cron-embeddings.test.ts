import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "@/lib/llm/errors";

/**
 * `app/api/cron/embeddings/route.ts`.
 *
 * ENG MUHIM TEKSHIRUV: sir sozlanmagan bo'lsa endpoint YOPIQ (503).
 * Ochiq qolgan cron endpoint — har kim bizning hisobimizdan pul
 * sarflashi mumkin degani.
 */

const mocks = vi.hoisted(() => ({
  findStaleTopics: vi.fn(),
  countStaleTopics: vi.fn(),
  embedTopics: vi.fn(),
  writeTopicVectors: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/curriculum/embed", () => ({
  findStaleTopics: mocks.findStaleTopics,
  countStaleTopics: mocks.countStaleTopics,
  embedTopics: mocks.embedTopics,
  writeTopicVectors: mocks.writeTopicVectors,
}));

const SECRET = "s".repeat(64);

function request(auth?: string): Request {
  return new Request("https://edudast.uz/api/cron/embeddings", {
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

/** `n` ta soxta mavzu. */
function topics(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t-${i}`,
    titleUz: `Mavzu ${i}`,
    objectives: [],
    keywords: [],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);

  mocks.countStaleTopics.mockResolvedValue(0);
  mocks.embedTopics.mockResolvedValue([]);
  // `$transaction(cb)` — callback'ni soxta `tx` bilan darhol chaqiramiz.
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({}));
});

describe("qorovul", () => {
  it("CRON_SECRET sozlanmagan bo'lsa 503 — endpoint BUTUNLAY yopiq", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(res.status).toBe(503);
    expect(mocks.findStaleTopics).not.toHaveBeenCalled();
  });

  it.each([
    ["sarlavha yo'q", undefined],
    ["bo'sh", ""],
    ["Bearer yo'q", SECRET],
    ["boshqa sir", `Bearer ${"x".repeat(64)}`],
    ["qisqa sir", "Bearer s"],
    ["uzun sir", `Bearer ${SECRET}x`],
    ["boshqa sxema", `Basic ${SECRET}`],
  ])("noto'g'ri ruxsat → 401: %s", async (_nom, auth) => {
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(auth) as never);

    expect(res.status).toBe(401);
    expect(mocks.embedTopics).not.toHaveBeenCalled();
  });

  it("to'g'ri sir bilan ishlaydi", async () => {
    mocks.findStaleTopics.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, written: 0, batches: 0 });
  });
});

describe("ish", () => {
  it("eskirgan qator yo'q bo'lsa chaqiruv qilmaydi", async () => {
    mocks.findStaleTopics.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    await GET(request(`Bearer ${SECRET}`) as never);

    expect(mocks.embedTopics).not.toHaveBeenCalled();
  });

  it("bir partiyani yozadi va hisobni qaytaradi", async () => {
    mocks.findStaleTopics.mockResolvedValueOnce(topics(10)).mockResolvedValue([]);
    mocks.writeTopicVectors.mockResolvedValue(10);
    mocks.countStaleTopics.mockResolvedValue(0);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(await res.json()).toMatchObject({
      ok: true,
      written: 10,
      batches: 1,
      remaining: 0,
      stalled: false,
    });
    // TARMOQ tranzaksiyadan TASHQARIDA: embedTopics `tx` ni olmaydi.
    expect(mocks.embedTopics).toHaveBeenCalledWith(expect.any(Array), { userId: null });
  });

  it("bitta chaqiruvda 200 tadan oshmaydi", async () => {
    // Har so'rovga to'liq partiya qaytaramiz — cheklov ishlamasa cheksiz
    // aylanardi.
    mocks.findStaleTopics.mockImplementation(
      async (_db: unknown, { limit }: { limit: number }) => topics(limit),
    );
    mocks.writeTopicVectors.mockImplementation(async (_tx, t: unknown[]) => t.length);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(await res.json()).toMatchObject({ written: 200, batches: 3 });
  });

  /**
   * CHEKSIZ AYLANMA QALQONI. `UPDATE` da `AND "deletedAt" IS NULL` bor:
   * so'rov bilan yozuv orasida mavzu o'chirilsa hech narsa yozilmaydi va
   * AYNI partiya qayta-qayta tanlanib, pul sarflab aylanib qolardi.
   */
  it("0 ta yozilgan partiyada to'xtaydi (stalled)", async () => {
    mocks.findStaleTopics.mockResolvedValue(topics(10));
    mocks.writeTopicVectors.mockResolvedValue(0);
    mocks.countStaleTopics.mockResolvedValue(10);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(mocks.embedTopics).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({
      ok: false,
      written: 0,
      stalled: true,
      remaining: 10,
    });
  });

  /**
   * Yiqilganda ham HTTP 200: Vercel Cron 5xx da qayta uradi va yiqilgan
   * provayderga qayta-qayta pul sarflardi. Holat javob tanasida.
   */
  it("provayder yiqilsa 200 + errorKind qaytaradi", async () => {
    mocks.findStaleTopics.mockResolvedValue(topics(10));
    mocks.embedTopics.mockRejectedValue(new LlmError("rate_limit", "chegara"));
    mocks.countStaleTopics.mockResolvedValue(10);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: false,
      written: 0,
      errorKind: "rate_limit",
      remaining: 10,
    });
  });

  it("o'rtada yiqilsa avvalgi partiyalar SAQLANADI", async () => {
    mocks.findStaleTopics.mockResolvedValue(topics(96));
    mocks.writeTopicVectors.mockResolvedValue(96);
    mocks.embedTopics
      .mockResolvedValueOnce([])
      .mockRejectedValue(new LlmError("overloaded", "band"));
    mocks.countStaleTopics.mockResolvedValue(104);
    const { GET } = await import("@/app/api/cron/embeddings/route");

    const res = await GET(request(`Bearer ${SECRET}`) as never);

    expect(await res.json()).toMatchObject({ ok: false, written: 96, errorKind: "overloaded" });
  });
});
