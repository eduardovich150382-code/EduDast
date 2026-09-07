import { describe, expect, it } from "vitest";
import { PROXY_MATCHER } from "@/lib/proxy-matcher";

/**
 * REGRESSIYA TESTI.
 *
 * Avvalgi middleware.ts da matcher shunday yozilgan edi:
 *
 *     matcher: ["/((?!api|_next|_vercel|.*\.*).*)"]     // bitta `\`
 *
 * Oddiy JS satrida `"\."` → `"."` ga aylanadi, ya'ni shart amalda
 * `(?!api|_next|_vercel|.*.*)` bo'lib qolgan. `.*.*` bo'sh satrni ham
 * topadi → salbiy lookahead HAR DOIM yiqiladi → matcher faqat "/" ga
 * mos kelgan. Natijada next-intl middleware /uz va /kirish da UMUMAN
 * ishlamagan.
 *
 * Quyidagi testlar shu xatoni qaytib kelishidan saqlaydi.
 */

// `proxy.ts` ning o'zi `config.matcher = PROXY_MATCHER` qiladi, ya'ni
// bu yerda tekshirilayotgan qiymat aynan production'da ishlatiladigani.
const patterns = PROXY_MATCHER;
const config = { matcher: PROXY_MATCHER };

/** Next.js matcher'ni yo'lning BUTUNIGA nisbatan qo'llaydi. */
function matches(pathname: string): boolean {
  return patterns.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("matcher satrining o'zi", () => {
  it("aynan bitta shablon bor", () => {
    expect(patterns).toHaveLength(1);
  });

  it("nuqta EKRANLANGAN (`\\.`) — xatoning ildizi shu edi", () => {
    // Satr qiymatida haqiqiy teskari chiziq + nuqta bo'lishi shart.
    expect(patterns[0]).toContain("\\.");
  });

  it("ekranlanmagan `.*.*` shabloni yo'q", () => {
    expect(patterns[0]).not.toContain(".*.*");
  });
});

describe("proxy TEGISHI kerak bo'lgan yo'llar", () => {
  it.each([
    "/",
    "/uz",
    "/uz-Cyrl",
    "/ru",
    "/kirish",
    "/ish",
    "/onboarding",
    "/uz/kirish",
    "/uz/ish",
    "/uz/onboarding",
    "/uz/onboarding/fanlar",
    "/uz-Cyrl/ish",
    "/uz-Cyrl/onboarding/sinflar",
    "/ru/kirish",
    "/ru/ish/abc",
  ])("%s", (pathname) => {
    expect(matches(pathname)).toBe(true);
  });
});

describe("proxy TEGMASLIGI kerak bo'lgan yo'llar", () => {
  it.each([
    "/api/health",
    "/api/auth/telegram",
    "/api/auth/telegram/uz",
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/_vercel/insights/view",
    "/favicon.ico",
    "/robots.txt",
    "/logo.svg",
  ])("%s", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });
});

describe("Next.js ning o'z matcher hisoblagichi bilan", () => {
  it("himoyalangan va chetlab o'tiladigan yo'llarni bir xil ajratadi", async () => {
    // Eslatma: hujjatda `unstable_doesProxyMatch` deyilgan, lekin
    // next@16.3.4 da haqiqiy eksport nomi hali ham `unstable_doesMiddlewareMatch`.
    const { unstable_doesMiddlewareMatch } = await import(
      "next/dist/experimental/testing/server"
    );

    const check = (url: string) =>
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

    expect(check("http://localhost:3000/uz/ish")).toBe(true);
    expect(check("http://localhost:3000/uz-Cyrl/onboarding")).toBe(true);
    expect(check("http://localhost:3000/ru/kirish")).toBe(true);
    expect(check("http://localhost:3000/")).toBe(true);

    expect(check("http://localhost:3000/api/auth/telegram/uz")).toBe(false);
    expect(check("http://localhost:3000/favicon.ico")).toBe(false);
  });
});
