import { describe, expect, it } from "vitest";
import {
  LlmError,
  RETRYABLE_KINDS,
  isRetryableKind,
  type LlmErrorKind,
} from "@/lib/llm/errors";
import { classifyGeminiError } from "@/lib/llm/providers/gemini";
import { classifyAnthropicError } from "@/lib/llm/providers/anthropic";
import { shouldAdvance } from "@/lib/llm/router";

/**
 * XATO TASNIFI JADVALI — butunlay qotirilgan.
 *
 * NEGA ALOHIDA FAYL: bu jadval PUL bilan bog'liq. Xato noto'g'ri tomonga
 * tasniflansa ikki xil zarar bo'ladi:
 *
 *   - vaqtinchalik xato TERMINAL deb tasniflansa — band vaqtdagi 429
 *     o'qituvchining hujjatini bekorga FAILED qiladi;
 *   - terminal xato QAYTA URINUVCHAN deb tasniflansa — buzuq kalitda kredit
 *     uch ijara sikli (~4.5 daqiqa) davomida band turadi.
 *
 * 08-sessiyada aynan ikkinchisi bo'lgan edi: noto'g'ri kalit `unknown` ga
 * tushib, qayta urinuvchan hisoblangan.
 */

/** Har xato turi uchun bittadan qator — yangi tur qo'shilsa TS majburlaydi. */
const TABLE: Record<LlmErrorKind, { retryable: boolean; advances: boolean; why: string }> = {
  // Vaqtinchalik: keyinroq o'tishi mumkin, kredit BAND qoladi.
  rate_limit: { retryable: true, advances: true, why: "chegara vaqtinchalik" },
  overloaded: { retryable: true, advances: true, why: "provayder avariyasi vaqtinchalik" },
  // Timeout va tarmoq uzilishi adapterlarda AYNAN shu turga o'raladi.
  unknown: { retryable: true, advances: true, why: "timeout/tarmoq shu yerga tushadi" },

  // Terminal: qayta urinish faqat pul kuydiradi, kredit DARHOL qaytariladi.
  invalid_output: { retryable: false, advances: true, why: "boshqa modelda sinashga arziydi" },
  refusal: { retryable: false, advances: false, why: "kontent qarori har modelda bir xil" },
  budget: { retryable: false, advances: false, why: "shift oshgan, zanjir yordam bermaydi" },
  disabled: { retryable: false, advances: false, why: "generatsiya o'chirilgan" },
  not_configured: { retryable: false, advances: false, why: "kalit yo'q yoki yaroqsiz" },
};

const KINDS = Object.keys(TABLE) as LlmErrorKind[];

describe("qayta urinish jadvali", () => {
  it.each(KINDS)("%s", (kind) => {
    const row = TABLE[kind];
    // Uchala joy BITTA jadvalga tayanishi shart. Ilgari ular uchta alohida
    // ro'yxat edi va `unknown` bo'yicha bir-biriga qarama-qarshi edi.
    expect(isRetryableKind(kind)).toBe(row.retryable);
    expect(new LlmError(kind, row.why).retryable).toBe(row.retryable);
    expect(RETRYABLE_KINDS.includes(kind)).toBe(row.retryable);
  });

  it("ro'yxat kutilganidan oshib ketmagan", () => {
    expect([...RETRYABLE_KINDS].sort()).toEqual(["overloaded", "rate_limit", "unknown"]);
  });
});

describe("zanjirda davom etish (shouldAdvance)", () => {
  /**
   * Bu ALOHIDA savol: "keyingi modelga o'tamizmi", "keyinroq qayta
   * urinamizmi" emas. `invalid_output` ikkalasida turlicha — boshqa modelda
   * darhol sinab ko'rishga arziydi, lekin ayni modelda kutib turishning
   * ma'nosi yo'q.
   */
  it.each(KINDS)("%s", (kind) => {
    expect(shouldAdvance(new LlmError(kind, TABLE[kind].why))).toBe(TABLE[kind].advances);
  });
});

/* ------------------------------------------------------------------ */
/* Provayder xatolarining tasnifi                                      */
/* ------------------------------------------------------------------ */

/** Gemini SDK xatosining shakli: status maydoni obyektda. */
function geminiError(fields: { status?: number; message?: string }): unknown {
  return Object.assign(new Error(fields.message ?? "xato"), { status: fields.status });
}

describe("Gemini xatolari", () => {
  it("429 — RATE_LIMIT, terminal EMAS", () => {
    // BAND VAQT SENARIYSI: bu terminal bo'lsa, kechqurun hamma o'qituvchi
    // bir vaqtda generatsiya qilganda hujjatlar bekorga FAILED bo'lardi.
    const err = classifyGeminiError(geminiError({ status: 429 }), "gemini-3.8-flash");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("kvota tugashi (RESOURCE_EXHAUSTED) — statussiz ham qayta urinuvchan", () => {
    // Gemini kvotani har doim 429 status kodi bilan qaytarmaydi.
    const err = classifyGeminiError(
      geminiError({ message: "RESOURCE_EXHAUSTED: Quota exceeded for quota metric" }),
      "gemini-3.8-flash",
    );
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("quota so'zi 400 bilan kelsa ham qayta urinuvchan", () => {
    const err = classifyGeminiError(
      geminiError({ status: 400, message: "Quota exceeded" }),
      "gemini-3.8-flash",
    );
    expect(err.retryable).toBe(true);
  });

  it("500+ — OVERLOADED, qayta urinuvchan", () => {
    const err = classifyGeminiError(geminiError({ status: 503 }), "gemini-3.8-flash");
    expect(err.kind).toBe("overloaded");
    expect(err.retryable).toBe(true);
  });

  it("400 + safety — REFUSAL, terminal", () => {
    const err = classifyGeminiError(
      geminiError({ status: 400, message: "blocked by safety settings" }),
      "gemini-3.8-flash",
    );
    expect(err.kind).toBe("refusal");
    expect(err.retryable).toBe(false);
  });

  it("noto'g'ri kalit (400 API_KEY_INVALID) — NOT_CONFIGURED, terminal", () => {
    // 08-sessiyadagi regressiya qorovuli: bu `unknown` bo'lsa kredit uch
    // ijara sikli davomida band turardi.
    const err = classifyGeminiError(
      geminiError({ status: 400, message: "API_KEY_INVALID" }),
      "gemini-3.8-flash",
    );
    expect(err.kind).toBe("not_configured");
    expect(err.retryable).toBe(false);
  });

  it.each([401, 403])("%s — NOT_CONFIGURED", (status) => {
    expect(classifyGeminiError(geminiError({ status }), "gemini-3.8-flash").kind).toBe(
      "not_configured",
    );
  });

  it("timeout / tarmoq uzilishi — UNKNOWN, lekin qayta urinuvchan", () => {
    // Status kodi yo'q: SDK tarmoq xatosini shunday beradi. Terminal bo'lsa
    // bitta uzilgan ulanish tayyor hujjatni yo'q qilardi.
    for (const message of ["fetch failed", "ETIMEDOUT", "socket hang up"]) {
      const err = classifyGeminiError(new Error(message), "gemini-3.8-flash");
      expect(err.kind).toBe("unknown");
      expect(err.retryable).toBe(true);
    }
  });

  it("allaqachon LlmError bo'lsa qayta o'ralmaydi", () => {
    const original = new LlmError("refusal", "rad etildi");
    expect(classifyGeminiError(original, "gemini-3.8-flash")).toBe(original);
  });

  it("provayderning o'z matni saqlanadi", () => {
    // "API xatosi 404" bilan hech narsa qilib bo'lmaydi.
    const err = classifyGeminiError(
      geminiError({ status: 404, message: "model not found in v1beta" }),
      "gemini-3.8-flash",
    );
    expect(err.message).toContain("model not found");
  });
});

describe("Anthropic xatolari", () => {
  /**
   * SDK'ning typed xato sinflari (`Anthropic.APIError`) BU YERDA
   * ishlatilmaydi: `tests/llm-guard.test.ts` SDK importini faqat
   * `lib/llm/providers/` ichida ruxsat etadi va bu qoidani test uchun
   * bo'shatish qorovulning ma'nosini yo'qotardi. Shuning uchun bu yerda
   * faqat SDK'SIZ yo'l — zaxira tarmog'i — tekshiriladi; status kodlari
   * bo'yicha tasnif Gemini'niki bilan bir xil shaklda yozilgan.
   */
  it("oddiy xato — UNKNOWN, qayta urinuvchan", () => {
    const err = classifyAnthropicError(new Error("socket hang up"), "claude-sonnet-5");
    expect(err.kind).toBe("unknown");
    expect(err.retryable).toBe(true);
  });

  it("allaqachon LlmError bo'lsa qayta o'ralmaydi", () => {
    const original = new LlmError("not_configured", "kalit yo'q");
    expect(classifyAnthropicError(original, "claude-sonnet-5")).toBe(original);
  });

  it("model nomi xabarga kiradi", () => {
    const err = classifyAnthropicError(new Error("nimadir"), "claude-sonnet-5");
    expect(err.message).toContain("claude-sonnet-5");
  });
});
