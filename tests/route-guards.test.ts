import { describe, expect, it } from "vitest";
import { decideRouteAccess, type GuardDecision } from "@/lib/auth/route-guards";

/**
 * docs/sessions/02-auth.md, 5-band. Butun jadval shu yerda qoplanadi —
 * proxy.ts ning o'zida hech qanday shart yo'q, u faqat shu qarorni bajaradi.
 */

const ANON = { isAuthed: false, isOnboarded: false };
const YARIM = { isAuthed: true, isOnboarded: false }; // kirgan, onboarding tugamagan
const TAYYOR = { isAuthed: true, isOnboarded: true };

const allow: GuardDecision = { kind: "allow" };
const toKirish: GuardDecision = { kind: "redirect", to: "/kirish" };
const toOnboarding: GuardDecision = { kind: "redirect", to: "/onboarding" };
const toIsh: GuardDecision = { kind: "redirect", to: "/ish" };

describe("ochiq sahifalar himoyalanmaydi", () => {
  it.each(["/", "/boshqa", "/narxlar"])("%s har uch holatda ochiq", (pathname) => {
    expect(decideRouteAccess({ pathname, ...ANON })).toEqual(allow);
    expect(decideRouteAccess({ pathname, ...YARIM })).toEqual(allow);
    expect(decideRouteAccess({ pathname, ...TAYYOR })).toEqual(allow);
  });
});

describe("/kirish", () => {
  it("anonim uchun ochiq", () => {
    expect(decideRouteAccess({ pathname: "/kirish", ...ANON })).toEqual(allow);
  });

  it("kirgan, onboarding tugamagan → /onboarding", () => {
    expect(decideRouteAccess({ pathname: "/kirish", ...YARIM })).toEqual(toOnboarding);
  });

  it("kirgan va tayyor → /ish (qayta so'ralmaydi)", () => {
    expect(decideRouteAccess({ pathname: "/kirish", ...TAYYOR })).toEqual(toIsh);
  });
});

describe("/onboarding", () => {
  it.each(["/onboarding", "/onboarding/fanlar", "/onboarding/sinflar", "/onboarding/viloyat"])(
    "%s — anonim → /kirish",
    (pathname) => {
      expect(decideRouteAccess({ pathname, ...ANON })).toEqual(toKirish);
    },
  );

  it.each(["/onboarding", "/onboarding/fanlar", "/onboarding/viloyat"])(
    "%s — tugallanmagan foydalanuvchi uchun ochiq",
    (pathname) => {
      expect(decideRouteAccess({ pathname, ...YARIM })).toEqual(allow);
    },
  );

  it("tayyor foydalanuvchi → /ish", () => {
    expect(decideRouteAccess({ pathname: "/onboarding", ...TAYYOR })).toEqual(toIsh);
  });
});

describe("/ish", () => {
  it.each(["/ish", "/ish/abc", "/ish/hujjat/123"])("%s — anonim → /kirish", (pathname) => {
    expect(decideRouteAccess({ pathname, ...ANON })).toEqual(toKirish);
  });

  it.each(["/ish", "/ish/abc"])("%s — tugallanmagan → /onboarding", (pathname) => {
    expect(decideRouteAccess({ pathname, ...YARIM })).toEqual(toOnboarding);
  });

  it.each(["/ish", "/ish/abc"])("%s — tayyor foydalanuvchi uchun ochiq", (pathname) => {
    expect(decideRouteAccess({ pathname, ...TAYYOR })).toEqual(allow);
  });
});

describe("segment chegarasi", () => {
  it.each(["/ishxona", "/ishla", "/kirishish", "/onboardingx"])(
    "%s himoyalangan yo'l EMAS",
    (pathname) => {
      expect(decideRouteAccess({ pathname, ...ANON })).toEqual(allow);
    },
  );
});

describe("sikl bo'lmasligi", () => {
  const holatlar = [
    ["anonim", ANON],
    ["tugallanmagan", YARIM],
    ["tayyor", TAYYOR],
  ] as const;
  const yollar = [
    "/",
    "/kirish",
    "/onboarding",
    "/onboarding/fanlar",
    "/ish",
    "/ish/abc",
    "/boshqa",
  ];

  it.each(holatlar)("%s: har yo'naltirish manzili o'sha holatda ochiq", (_nom, holat) => {
    for (const pathname of yollar) {
      const decision = decideRouteAccess({ pathname, ...holat });
      if (decision.kind === "allow") continue;

      // Yo'naltirilgan manzil o'sha holat uchun `allow` bo'lishi shart,
      // aks holda brauzer cheksiz aylanishga tushadi.
      expect(decideRouteAccess({ pathname: decision.to, ...holat })).toEqual(allow);
    }
  });
});
