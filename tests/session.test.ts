import { SignJWT, UnsecuredJWT, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_SECRET_MIN_BYTES,
  decodeSession,
  encodeSession,
  type SessionPayload,
} from "@/lib/auth/session";

/**
 * Sessiya JWT'i (docs/sessions/02-auth.md, 2-band + xavfsizlik talablari).
 *
 * Kalit `process.env` dan lazy o'qiladi, shuning uchun testlar uni har
 * holatda o'zgartirib qayta chaqira oladi — modulni qayta import qilish
 * shart emas.
 */

const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);
const PAYLOAD: SessionPayload = { sub: "cku1abc23def45gh6", onb: true, sv: 3 };

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("encode/decode round-trip", () => {
  it("payload o'zgarmasdan qaytadi", async () => {
    expect(await decodeSession(await encodeSession(PAYLOAD))).toEqual(PAYLOAD);
  });

  it("onb=false ham to'g'ri saqlanadi", async () => {
    const payload: SessionPayload = { ...PAYLOAD, onb: false };

    expect(await decodeSession(await encodeSession(payload))).toEqual(payload);
  });

  it("sessionVersion saqlanadi", async () => {
    const token = await encodeSession({ ...PAYLOAD, sv: 42 });

    expect((await decodeSession(token))?.sv).toBe(42);
  });

  it("tokenda telegramId yoki ism yo'q", async () => {
    const token = await encodeSession(PAYLOAD);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;

    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "onb", "sub", "sv"]);
  });
});

describe("yaroqsiz tokenlar — null, throw yo'q", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["bo'sh satr", ""],
    ["JWT bo'lmagan satr", "abc"],
    ["nuqtali axlat", "a.b.c"],
  ])("%s → null", async (_nom, token) => {
    await expect(decodeSession(token)).resolves.toBeNull();
  });

  it("buzilgan payload segmenti rad etiladi", async () => {
    const [header, , signature] = (await encodeSession(PAYLOAD)).split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "hujumchi", onb: true, sv: 0, exp: 9_999_999_999 }),
    ).toString("base64url");

    await expect(decodeSession(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("boshqa sir bilan imzolangan token rad etiladi", async () => {
    const token = await encodeSession(PAYLOAD);
    process.env.SESSION_SECRET = OTHER_SECRET;

    await expect(decodeSession(token)).resolves.toBeNull();
  });

  it("muddati o'tgan token rad etiladi", async () => {
    const token = await encodeSession(PAYLOAD, { maxAgeSeconds: -60 });

    await expect(decodeSession(token)).resolves.toBeNull();
  });
});

describe("alg qat'iy pinlangan", () => {
  it("alg=none (imzosiz JWT) rad etiladi", async () => {
    const unsecured = new UnsecuredJWT({ onb: true, sv: 0 })
      .setSubject(PAYLOAD.sub)
      .setIssuedAt()
      .setExpirationTime("30d")
      .encode();

    await expect(decodeSession(unsecured)).resolves.toBeNull();
  });

  it("alg=HS512 ga almashtirilgan token rad etiladi", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ onb: true, sv: 0 })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject(PAYLOAD.sub)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);

    await expect(decodeSession(token)).resolves.toBeNull();
  });

  it("RS256 bilan imzolangan token rad etiladi (alg-confusion)", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ onb: true, sv: 0 })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(PAYLOAD.sub)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(privateKey);

    await expect(decodeSession(token)).resolves.toBeNull();
  });
});

describe("majburiy da'volar", () => {
  it("exp'siz token rad etiladi", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ onb: true, sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(PAYLOAD.sub)
      .setIssuedAt()
      .sign(key);

    await expect(decodeSession(token)).resolves.toBeNull();
  });

  it("sub'siz token rad etiladi", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ onb: true, sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);

    await expect(decodeSession(token)).resolves.toBeNull();
  });

  it.each([
    ["onb yo'q", { sv: 0 }],
    ["onb boolean emas", { onb: "ha", sv: 0 }],
    ["sv yo'q", { onb: true }],
    ["sv butun son emas", { onb: true, sv: 1.5 }],
    ["sv satr", { onb: true, sv: "3" }],
  ])("%s → null", async (_nom, claims) => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(PAYLOAD.sub)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);

    await expect(decodeSession(token)).resolves.toBeNull();
  });
});

describe("SESSION_SECRET tekshiruvi", () => {
  it.each([
    ["yo'q", undefined],
    ["bo'sh", ""],
    [`${SESSION_SECRET_MIN_BYTES - 1} bayt`, "a".repeat(SESSION_SECRET_MIN_BYTES - 1)],
  ])("%s bo'lsa imzolash xato beradi", async (_nom, secret) => {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;

    await expect(encodeSession(PAYLOAD)).rejects.toThrow(/SESSION_SECRET/);
  });

  it("aynan 32 bayt yetarli", async () => {
    process.env.SESSION_SECRET = "c".repeat(SESSION_SECRET_MIN_BYTES);

    await expect(encodeSession(PAYLOAD)).resolves.toBeTypeOf("string");
  });

  it("uzunlik BAYTDA o'lchanadi, belgida emas", async () => {
    // 20 ta kirill harfi = 40 bayt (UTF-8), ya'ni 32 bayt shartidan o'tadi,
    // lekin belgi bo'yicha sanalsa o'tmasdi.
    process.env.SESSION_SECRET = "ж".repeat(20);

    await expect(encodeSession(PAYLOAD)).resolves.toBeTypeOf("string");
  });

  it("xato matnida sirning o'zi yo'q", async () => {
    const secret = "juda-maxfiy-lekin-qisqa";
    process.env.SESSION_SECRET = secret;

    await expect(encodeSession(PAYLOAD)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(secret) as unknown as string,
      }),
    );
  });

  it("sir sozlanmagan bo'lsa ham decode throw qilmaydi", async () => {
    const token = await encodeSession(PAYLOAD);
    delete process.env.SESSION_SECRET;

    await expect(decodeSession(token)).resolves.toBeNull();
  });
});
