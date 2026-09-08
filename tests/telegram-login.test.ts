import { describe, expect, it } from "vitest";
import {
  buildDeepLink,
  createLoginCode,
  createLoginVerifier,
  hashVerifier,
  isValidLoginCode,
  loginTokenState,
  parseStartCommand,
  verifierMatches,
} from "@/lib/auth/telegram-login";

/**
 * Deep-link login'ning xavfsizlik mantig'i. Bu yerda DB ham, Next ham
 * yo'q — lib/auth/telegram-login.ts ataylab sof modul.
 */

describe("createLoginCode", () => {
  it("Telegram `start` parametri chegarasiga sig'adi", () => {
    const code = createLoginCode();
    // Telegram: eng ko'pi 64 belgi, faqat A-Z a-z 0-9 _ -
    expect(code.length).toBeLessThanOrEqual(64);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isValidLoginCode(code)).toBe(true);
  });

  it("har chaqiruvda boshqa qiymat qaytaradi", () => {
    const codes = new Set(Array.from({ length: 50 }, () => createLoginCode()));
    expect(codes.size).toBe(50);
  });
});

describe("isValidLoginCode", () => {
  it("qisqa, uzun va noto'g'ri belgili kodlarni rad etadi", () => {
    expect(isValidLoginCode("qisqa")).toBe(false);
    expect(isValidLoginCode("a".repeat(65))).toBe(false);
    expect(isValidLoginCode("kod bilan bo'shliq")).toBe(false);
    expect(isValidLoginCode("kod/slash+plus=")).toBe(false);
  });
});

describe("verifierMatches", () => {
  it("to'g'ri verifier'ni tan oladi", () => {
    const verifier = createLoginVerifier();
    expect(verifierMatches(verifier, hashVerifier(verifier))).toBe(true);
  });

  it("boshqa verifier'ni rad etadi", () => {
    const stored = hashVerifier(createLoginVerifier());
    expect(verifierMatches(createLoginVerifier(), stored)).toBe(false);
  });

  it("noto'g'ri formatdagi kirishda throw QILMAYDI", () => {
    // `timingSafeEqual` uzunliklar teng bo'lmasa throw qiladi — shu sabab
    // format tekshiruvi hash'lashdan oldin turadi.
    expect(verifierMatches("", "")).toBe(false);
    expect(verifierMatches("qisqa", hashVerifier("qisqa"))).toBe(false);
    expect(verifierMatches(createLoginVerifier(), "hash-emas")).toBe(false);
  });
});

describe("parseStartCommand", () => {
  it("payloadsiz /start ni o'qiydi", () => {
    expect(parseStartCommand("/start")).toEqual({ code: null });
    expect(parseStartCommand("  /start  ")).toEqual({ code: null });
  });

  it("guruhdagi /start@BotNomi shaklini ham o'qiydi", () => {
    expect(parseStartCommand("/start@EduDastBot")).toEqual({ code: null });
  });

  it("to'g'ri payloadni qaytaradi", () => {
    const code = createLoginCode();
    expect(parseStartCommand(`/start ${code}`)).toEqual({ code });
    expect(parseStartCommand(`/start@EduDastBot ${code}`)).toEqual({ code });
  });

  it("noto'g'ri payloadni JIM tashlab yuboradi (xato emas)", () => {
    // Foydalanuvchi qo'lda `/start salom` yozsa — oddiy salomlashuv.
    expect(parseStartCommand("/start salom")).toEqual({ code: null });
  });

  it("/start bo'lmagan matnga null qaytaradi", () => {
    expect(parseStartCommand("/help")).toBeNull();
    expect(parseStartCommand("salom")).toBeNull();
    expect(parseStartCommand(undefined)).toBeNull();
    expect(parseStartCommand("")).toBeNull();
  });
});

describe("loginTokenState", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const kelajak = new Date("2026-01-01T12:05:00Z");
  const otgan = new Date("2026-01-01T11:55:00Z");

  const asos = {
    userId: null as string | null,
    approvedAt: null as Date | null,
    consumedAt: null as Date | null,
    expiresAt: kelajak,
  };

  it("token topilmasa yaroqsiz", () => {
    expect(loginTokenState(null, now)).toBe("yaroqsiz");
  });

  it("tasdiqlanmagan token — kutilmoqda", () => {
    expect(loginTokenState(asos, now)).toBe("kutilmoqda");
  });

  it("tasdiqlangan token — tayyor", () => {
    expect(
      loginTokenState({ ...asos, userId: "u1", approvedAt: now }, now),
    ).toBe("tayyor");
  });

  it("muddati o'tgan token tasdiqlangan bo'lsa ham yaroqsiz", () => {
    expect(
      loginTokenState(
        { ...asos, userId: "u1", approvedAt: otgan, expiresAt: otgan },
        now,
      ),
    ).toBe("yaroqsiz");
  });

  it("ishlatilgan token qayta ishlatilmaydi", () => {
    expect(
      loginTokenState(
        { ...asos, userId: "u1", approvedAt: otgan, consumedAt: otgan },
        now,
      ),
    ).toBe("yaroqsiz");
  });

  it("aynan muddat tugash lahzasida yaroqsiz (chegara)", () => {
    expect(
      loginTokenState({ ...asos, userId: "u1", approvedAt: otgan, expiresAt: now }, now),
    ).toBe("yaroqsiz");
  });

  it("userId'siz `approvedAt` sessiya bermaydi", () => {
    // Bunday holat bo'lmasligi kerak, lekin bo'lsa — kutilmoqda, tayyor emas.
    expect(loginTokenState({ ...asos, approvedAt: now }, now)).toBe("kutilmoqda");
  });
});

describe("buildDeepLink", () => {
  it("t.me havolasini quradi", () => {
    expect(buildDeepLink("EduDastBot", "abc123")).toBe(
      "https://t.me/EduDastBot?start=abc123",
    );
  });
});
