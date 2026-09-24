import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * `runLlm` — qatlamning yagona eshigi. Bu yerda CLAUDE.md 3-qoidasi
 * ("har chaqiruvda xarajat yoziladi") va 5-qoidasi (byudjet shifti)
 * tekshiriladi.
 */

type LoggedCall = {
  userId: string | null;
  documentId?: string;
  provider: string;
  model: string;
  usage: { tokensIn: number; tokensOut: number };
  purpose: string;
};
type Verdict = { kind: "full" | "downgrade" | "deny"; reason?: string };

const { logMock, budgetMock } = vi.hoisted(() => ({
  logMock: vi.fn<(rec: LoggedCall) => Promise<string | null>>(async () => "llmcall-1"),
  budgetMock: vi.fn<(opts: unknown) => Promise<Verdict>>(async () => ({ kind: "full" })),
}));

vi.mock("@/lib/llm/log", () => ({ writeLlmCall: logMock }));
vi.mock("@/lib/budget/guard", () => ({ checkBudget: budgetMock }));

import { runLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/errors";
import { FakeProvider } from "@/lib/llm/providers/fake";
import { setProvider } from "@/lib/llm/providers/registry";

const Schema = z.object({ javob: z.string() });
const OK = JSON.stringify({ javob: "tezlik" });

let fake: FakeProvider;

function request(over: Record<string, unknown> = {}) {
  return {
    purpose: "test:stage-1",
    tier: "cheap" as const,
    userId: "user-1",
    documentId: "doc-1",
    system: [{ text: "ko'rsatma", cacheable: true }],
    messages: [{ role: "user" as const, content: "savol" }],
    schema: Schema,
    maxOutputTokens: 512,
    ...over,
  };
}

beforeEach(() => {
  fake = new FakeProvider();
  // Fake'ni ikkala provayder o'rniga qo'yamiz — zanjirning har bosqichi
  // o'sha soxta provayderga tushadi.
  setProvider("anthropic", fake);
  setProvider("gemini", fake);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("LLM_AB_ENABLED", "false");
  logMock.mockClear();
  budgetMock.mockClear();
  budgetMock.mockResolvedValue({ kind: "full" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("muvaffaqiyatli chaqiruv", () => {
  it("natijani Zod bilan tekshirib qaytaradi", async () => {
    fake.queue({ kind: "ok", rawJson: OK });
    const res = await runLlm(request());
    expect(res.data).toEqual({ javob: "tezlik" });
    expect(res.provider).toBe("anthropic");
  });

  it("LlmCall yoziladi: model, tokenlar, maqsad", async () => {
    fake.queue({ kind: "ok", rawJson: OK, usage: { tokensIn: 120, tokensOut: 30 } });
    await runLlm(request());

    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock.mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      documentId: "doc-1",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      purpose: "test:stage-1",
      usage: { tokensIn: 120, tokensOut: 30 },
    });
  });

  it("xarajat 6 xonali satr sifatida qaytadi", async () => {
    fake.queue({ kind: "ok", rawJson: OK, usage: { tokensIn: 1_000_000, tokensOut: 0 } });
    const res = await runLlm(request());
    expect(res.costUsd).toBe("1.000000");
  });

  it("keshlanadigan system qismi provayderga tartibi bilan uzatiladi", async () => {
    fake.queue({ kind: "ok", rawJson: OK });
    await runLlm(
      request({
        system: [
          { text: "barqaror", cacheable: true },
          { text: "o'zgaruvchan" },
        ],
      }),
    );
    expect(fake.calls[0]!.system).toEqual([
      { text: "barqaror", cacheable: true },
      { text: "o'zgaruvchan" },
    ]);
  });

  it("tizim chaqiruvi (userId null) ham yoziladi", async () => {
    fake.queue({ kind: "ok", rawJson: OK });
    await runLlm(request({ userId: null, documentId: undefined }));
    expect(logMock.mock.calls[0]![0]).toMatchObject({ userId: null });
  });
});

describe("xato bo'lganda ham jurnal yoziladi", () => {
  it("provayder xato bersa, lekin usage qaytgan bo'lsa — qator yoziladi", async () => {
    // Bu 3-qoidaning eng nozik joyi: pul ketgan, javob kelmagan.
    // `hard` daraja: zanjirda ikkinchi urinish bor. (`cheap` da pastga
    // tushadigan joy yo'q, shuning uchun u yerda xato darhol chiqadi.)
    fake.queue(
      { kind: "error", error: "overloaded", usage: { tokensIn: 90, tokensOut: 0 } },
      { kind: "ok", rawJson: OK },
    );
    await runLlm(request({ tier: "hard" }));

    expect(logMock).toHaveBeenCalledTimes(2);
    expect(logMock.mock.calls[0]![0]).toMatchObject({ usage: { tokensIn: 90 } });
  });

  it("sxemaga mos kelmagan javob ham yoziladi — pul baribir ketgan", async () => {
    fake.queue({ kind: "ok", rawJson: JSON.stringify({ boshqa: 1 }) });
    await expect(runLlm(request({ tier: "cheap" }))).rejects.toThrow();
    expect(logMock).toHaveBeenCalled();
  });

  it("jurnal yozuvchisi yiqilsa chaqiruv baribir muvaffaqiyatli", async () => {
    // Tayyor generatsiyani jurnal xatosi sababli yo'qotib bo'lmaydi.
    logMock.mockResolvedValueOnce(null);
    fake.queue({ kind: "ok", rawJson: OK });
    const res = await runLlm(request());
    expect(res.data.javob).toBe("tezlik");
    expect(res.llmCallId).toBeNull();
  });
});

describe("zanjir va qayta urinish", () => {
  it("overloaded — pastroq modelga tushadi", async () => {
    fake.queue({ kind: "error", error: "overloaded" }, { kind: "ok", rawJson: OK });
    const res = await runLlm(request({ tier: "hard" }));
    expect(fake.calls[0]!.model).toBe("claude-opus-5");
    expect(fake.calls[1]!.model).toBe("claude-sonnet-5");
    expect(res.model).toBe("claude-sonnet-5");
  });

  it("rate_limit — avval o'sha modelda bir marta qayta urinadi", async () => {
    fake.queue({ kind: "error", error: "rate_limit" }, { kind: "ok", rawJson: OK });
    const res = await runLlm(request({ tier: "hard" }));
    expect(fake.calls[0]!.model).toBe("claude-opus-5");
    expect(fake.calls[1]!.model).toBe("claude-opus-5");
    expect(res.model).toBe("claude-opus-5");
  });

  it("refusal — qayta urinmaydi, darhol xato", async () => {
    fake.queue({ kind: "error", error: "refusal" });
    await expect(runLlm(request({ tier: "hard" }))).rejects.toMatchObject({ kind: "refusal" });
    expect(fake.calls).toHaveLength(1);
  });

  it("ikkinchi provayderga o'tadi", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "g-key");
    fake.queue(
      { kind: "error", error: "overloaded" },
      { kind: "error", error: "overloaded" },
      { kind: "ok", rawJson: OK },
    );
    const res = await runLlm(request({ tier: "hard" }));
    expect(res.provider).toBe("gemini");
  });
});

describe("byudjet shifti", () => {
  it("deny — provayder umuman chaqirilmaydi", async () => {
    budgetMock.mockResolvedValue({ kind: "deny", reason: "monthly" });
    await expect(runLlm(request())).rejects.toMatchObject({ kind: "budget" });
    expect(fake.calls).toHaveLength(0);
    expect(logMock).not.toHaveBeenCalled();
  });

  it("disabled — alohida xato turi", async () => {
    budgetMock.mockResolvedValue({ kind: "deny", reason: "disabled" });
    await expect(runLlm(request())).rejects.toMatchObject({ kind: "disabled" });
  });

  it("downgrade — arzonroq model tanlanadi", async () => {
    budgetMock.mockResolvedValue({ kind: "downgrade", reason: "monthly" });
    fake.queue({ kind: "ok", rawJson: OK });
    await runLlm(request({ tier: "hard" }));
    expect(fake.calls[0]!.model).toBe("claude-sonnet-5");
  });

  it("byudjet chaqiruvdan OLDIN tekshiriladi", async () => {
    fake.queue({ kind: "ok", rawJson: OK });
    await runLlm(request());
    expect(budgetMock).toHaveBeenCalledTimes(1);
  });
});

describe("sozlanmagan holat", () => {
  it("birorta kalit yo'q bo'lsa aniq xato", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    setProvider("anthropic", null);
    setProvider("gemini", null);
    await expect(runLlm(request())).rejects.toBeInstanceOf(LlmError);
  });
});
