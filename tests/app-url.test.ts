import { describe, expect, it } from "vitest";
import { appBaseUrl } from "@/lib/app-url";

/**
 * Baza manzili — `process.env` PARAMETR sifatida beriladi, shuning uchun
 * bu testda `vi.stubEnv` kerak emas va holat testlar orasida oqib
 * ketmaydi.
 */

describe("appBaseUrl", () => {
  it("NEXT_PUBLIC_APP_URL birinchi o'rinda", () => {
    expect(
      appBaseUrl({
        NEXT_PUBLIC_APP_URL: "https://edudast.uz",
        VERCEL_PROJECT_PRODUCTION_URL: "boshqa.vercel.app",
      }),
    ).toBe("https://edudast.uz");
  });

  it("oxiridagi slash kesiladi", () => {
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://edudast.uz/" })).toBe("https://edudast.uz");
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://edudast.uz///" })).toBe("https://edudast.uz");
  });

  it("atrofdagi bo'sh joy tozalanadi", () => {
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "  https://edudast.uz  " })).toBe(
      "https://edudast.uz",
    );
  });

  it("bo'sh satr sozlanmagan deb hisoblanadi", () => {
    expect(
      appBaseUrl({ NEXT_PUBLIC_APP_URL: "   ", VERCEL_PROJECT_PRODUCTION_URL: "edudast.vercel.app" }),
    ).toBe("https://edudast.vercel.app");
  });

  it("VERCEL_PROJECT_PRODUCTION_URL ga `https://` qo'shiladi", () => {
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "edudast.vercel.app" })).toBe(
      "https://edudast.vercel.app",
    );
  });

  it("hech narsa sozlanmasa `null` — THROW QILMAYDI", () => {
    expect(appBaseUrl({})).toBeNull();
  });

  /**
   * Bu AYNIQSA muhim: `VERCEL_URL` har deploy uchun alohida manzil.
   * U ishlatilsa Telegram xabariga preview hosti qotib qolardi va o'sha
   * deploy o'chgach havola o'lik bo'lib qolardi — xabar esa foydalanuvchi
   * tarixida abadiy turadi.
   */
  it("VERCEL_URL E'TIBORGA OLINMAYDI", () => {
    expect(appBaseUrl({ VERCEL_URL: "dep-xyz.vercel.app" })).toBeNull();
  });
});
