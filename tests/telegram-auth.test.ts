import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDataCheckString,
  normalizeBotToken,
  normalizeBotUsername,
  verifyTelegramAuth,
} from "@/lib/auth/telegram";

/**
 * Telegram Login payload tekshiruvi (docs/sessions/02-auth.md, 6-band).
 *
 * Eng muhim guruh — "bot tokeni sizib chiqmaydi": natijada ham, tashlangan
 * xatoda ham token bo'lmasligi kerak. Shuning uchun bu yerda ataylab
 * haqiqiy ko'rinishdagi token ishlatiladi.
 */

const BOT_TOKEN = "7654321098:AAH-ZzQwErTyUiOpAsDfGhJkLzXcVbNm123";
const NOW = 1_760_000_000;

/** Telegram serveri qiladigan ishni takrorlaydi — testlar uchun imzolovchi. */
function sign(params: Record<string, string>, botToken = BOT_TOKEN): Record<string, string> {
  const secretKey = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secretKey)
    .update(buildDataCheckString(params))
    .digest("hex");
  return { ...params, hash };
}

function basePayload(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: "123456789",
    first_name: "Aziza",
    last_name: "Karimova",
    username: "aziza_teacher",
    photo_url: "https://t.me/i/userpic/320/aziza.jpg",
    auth_date: String(NOW - 10),
    ...overrides,
  };
}

const verify = (params: Record<string, string>) =>
  verifyTelegramAuth(params, { botToken: BOT_TOKEN, nowSeconds: NOW });

/** Payload'dan bitta maydonni olib tashlaydi (ixtiyoriy maydonlarni sinash uchun). */
function without(params: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(params).filter(([k]) => k !== key));
}

/** `telegramId` — BigInt, uni oddiy JSON.stringify serializatsiya qila olmaydi. */
function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

describe("buildDataCheckString", () => {
  it("hash'ni chiqarib tashlaydi va kalitlarni saralaydi", () => {
    expect(buildDataCheckString({ b: "2", hash: "xxx", a: "1", c: "3" })).toBe(
      "a=1\nb=2\nc=3",
    );
  });

  it("noma'lum maydonlarni ham qo'shadi (allowlist yo'q)", () => {
    expect(buildDataCheckString({ id: "1", yangi_maydon: "qiymat" })).toContain(
      "yangi_maydon=qiymat",
    );
  });
});

describe("verifyTelegramAuth — to'g'ri payload", () => {
  it("o'tadi va foydalanuvchi ma'lumotini qaytaradi", () => {
    const result = verify(sign(basePayload()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // BigInt literal (`123n`) tsconfig target ES2017 da mavjud emas.
    expect(result.data.telegramId).toBe(BigInt("123456789"));
    expect(typeof result.data.telegramId).toBe("bigint");
    expect(result.data.fullName).toBe("Aziza Karimova");
    expect(result.data.username).toBe("aziza_teacher");
    expect(result.data.authDate).toBe(NOW - 10);
  });

  it("last_name yo'q bo'lsa fullName faqat ismdan iborat", () => {
    const result = verify(sign(without(basePayload(), "last_name")));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fullName).toBe("Aziza");
  });

  it("username yo'q bo'lsa null qaytadi", () => {
    const result = verify(sign(without(basePayload(), "username")));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.username).toBeNull();
  });

  it("photo_url imzoga kiradi, lekin natijada qaytarilmaydi", () => {
    const result = verify(sign(basePayload()));

    expect(result.ok).toBe(true);
    expect(stringify(result)).not.toContain("userpic");
  });

  it("imzolangan noma'lum qo'shimcha maydon bilan ham o'tadi", () => {
    const result = verify(sign(basePayload({ kelajakdagi_maydon: "1" })));

    expect(result.ok).toBe(true);
  });
});

describe("verifyTelegramAuth — buzilgan imzo", () => {
  it("hash'ning bitta hex belgisi o'zgarsa rad etadi", () => {
    const signed = sign(basePayload());
    const first = signed.hash!.slice(0, 1);
    const tampered = {
      ...signed,
      hash: (first === "a" ? "b" : "a") + signed.hash!.slice(1),
    };

    expect(verify(tampered)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("imzodan keyin first_name o'zgarsa rad etadi", () => {
    const signed = sign(basePayload());

    expect(verify({ ...signed, first_name: "Hujumchi" })).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });

  it("imzodan keyin yangi maydon qo'shilsa rad etadi", () => {
    const signed = sign(basePayload());

    expect(verify({ ...signed, id: "999" })).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });

  it("boshqa bot tokeni bilan imzolangan payload rad etiladi", () => {
    const signed = sign(basePayload(), "1111111111:BBBoshqaBotTokeni_XyZ");

    expect(verify(signed)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it.each([
    ["kalta", "abc123"],
    ["toq uzunlikdagi", "a".repeat(63)],
    ["hex bo'lmagan", "z".repeat(64)],
    ["katta harfli", "A".repeat(64)],
    ["juda uzun", "a".repeat(128)],
  ])("%s hash — throw qilmasdan rad etiladi", (_nom, hash) => {
    expect(() => verify({ ...basePayload(), hash })).not.toThrow();
    expect(verify({ ...basePayload(), hash })).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });
});

describe("verifyTelegramAuth — shakl va muddat", () => {
  it("hash yo'q bo'lsa missing_hash", () => {
    expect(verify(basePayload())).toEqual({ ok: false, reason: "missing_hash" });
  });

  it("bo'sh hash ham missing_hash", () => {
    expect(verify({ ...basePayload(), hash: "" })).toEqual({
      ok: false,
      reason: "missing_hash",
    });
  });

  it("raqam bo'lmagan id — invalid_payload", () => {
    expect(verify(sign(basePayload({ id: "abc" })))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("bo'sh first_name — invalid_payload", () => {
    expect(verify(sign(basePayload({ first_name: "" })))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("5 daqiqadan eski auth_date rad etiladi", () => {
    expect(verify(sign(basePayload({ auth_date: String(NOW - 301) })))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("aynan 5 daqiqalik auth_date hali o'tadi", () => {
    expect(verify(sign(basePayload({ auth_date: String(NOW - 300) }))).ok).toBe(true);
  });

  it("kelajakdagi auth_date (soxta sana) rad etiladi", () => {
    expect(verify(sign(basePayload({ auth_date: String(NOW + 600) })))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("kichik soat siljishi kechiriladi", () => {
    expect(verify(sign(basePayload({ auth_date: String(NOW + 30) }))).ok).toBe(true);
  });

  it("buzilgan payload sana tekshiruviga yetib bormaydi (hash birinchi)", () => {
    const signed = sign(basePayload({ auth_date: String(NOW - 9999) }));

    // Sana ham eski, imzo ham buzilgan — sabab `bad_hash` bo'lishi kerak,
    // ya'ni hujumchi sana haqida hech narsa bilib olmaydi.
    expect(verify({ ...signed, first_name: "Hujumchi" })).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });
});

describe("verifyTelegramAuth — bot tokeni sizib chiqmaydi", () => {
  const cases: Array<[string, Record<string, string>]> = [
    ["muvaffaqiyatli", sign(basePayload())],
    ["buzilgan imzo", { ...sign(basePayload()), first_name: "X" }],
    ["hash yo'q", basePayload()],
    ["noto'g'ri shakl", sign(basePayload({ id: "abc" }))],
    ["muddati o'tgan", sign(basePayload({ auth_date: String(NOW - 5000) }))],
    ["buzuq hash", { ...basePayload(), hash: "!!!" }],
  ];

  it.each(cases)("%s natijada token yo'q", (_nom, params) => {
    const result = verifyTelegramAuth(params, { botToken: BOT_TOKEN, nowSeconds: NOW });

    expect(stringify(result)).not.toContain(BOT_TOKEN);
    // Token'ning sirli qismi ham (":" dan keyingi) bo'lak-bo'lak sizmasin.
    expect(stringify(result)).not.toContain(BOT_TOKEN.split(":")[1]!);
  });

  it.each(cases)("%s throw qilmaydi", (_nom, params) => {
    expect(() =>
      verifyTelegramAuth(params, { botToken: BOT_TOKEN, nowSeconds: NOW }),
    ).not.toThrow();
  });

  it("xato sabablari yopiq literal ro'yxatdan chiqmaydi", () => {
    const allowed = ["missing_hash", "invalid_payload", "bad_hash", "expired"];

    for (const [, params] of cases) {
      const result = verifyTelegramAuth(params, { botToken: BOT_TOKEN, nowSeconds: NOW });
      if (!result.ok) expect(allowed).toContain(result.reason);
    }
  });
});

/**
 * REGRESSIYA: production'da haqiqiy login doim "bad_hash" bilan
 * yiqilgan holat topildi — sababi Vercel dashboard'iga qo'lda kiritilgan
 * TELEGRAM_BOT_TOKEN atrofida yashirin bo'shliq/qator ko'chirish qolib
 * ketishi (yoki username "@" bilan). Bittagina ortiqcha belgi
 * SHA256(bot_token) ni butunlay boshqa kalitga aylantiradi.
 */
describe("normalizeBotToken", () => {
  it("boshi/oxiridagi bo'shliqni olib tashlaydi", () => {
    expect(normalizeBotToken(`  ${BOT_TOKEN}  `)).toBe(BOT_TOKEN);
  });

  it("oxiridagi qator ko'chirishni olib tashlaydi (.env dan copy-paste)", () => {
    expect(normalizeBotToken(`${BOT_TOKEN}\n`)).toBe(BOT_TOKEN);
  });

  it.each([
    ["undefined", undefined],
    ["bo'sh satr", ""],
    ["faqat bo'shliq", "   "],
  ])("%s → undefined", (_nom, raw) => {
    expect(normalizeBotToken(raw)).toBeUndefined();
  });

  it("tozalangan token bilan tozalanmagan hash mos kelmaydi (bo'shliqli token bilan imzolangan payload)", () => {
    // Bo'shliqli "token" bilan imzolansa (route buni hech qachon qilmaydi,
    // lekin normalize qilinmasa xuddi shu holat yuz beradi), tozalangan
    // token bilan tekshiruv bad_hash beradi — bu aynan production'da
    // kuzatilgan nosozlik.
    const dirtyToken = `${BOT_TOKEN}\n`;
    const signed = sign(basePayload(), dirtyToken);

    const result = verifyTelegramAuth(signed, {
      botToken: normalizeBotToken(dirtyToken)!,
      nowSeconds: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });
});

describe("normalizeBotUsername", () => {
  it("boshidagi @ ni olib tashlaydi", () => {
    expect(normalizeBotUsername("@edudast_bot")).toBe("edudast_bot");
  });

  it("bo'shliqni olib tashlaydi", () => {
    expect(normalizeBotUsername("  edudast_bot  ")).toBe("edudast_bot");
  });

  it("@ va bo'shliq birga bo'lsa ham to'g'ri", () => {
    expect(normalizeBotUsername("  @edudast_bot\n")).toBe("edudast_bot");
  });

  it.each([
    ["undefined", undefined],
    ["bo'sh satr", ""],
    ["faqat @", "@"],
  ])("%s → undefined", (_nom, raw) => {
    expect(normalizeBotUsername(raw)).toBeUndefined();
  });
});
