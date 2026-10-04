import { describe, expect, it } from "vitest";
import { lessonPath, lessonUrl, type LinkableLesson } from "@/lib/reminders/link";

/**
 * Chuqur havola shartnomasi bosh sahifadagi `prepareHref` bilan AYNAN
 * bir xil bo'lishi kerak: `/ish/yarat?fan=&sinf=&chorak=&mavzu=`.
 * Shu sababli testlar LITERAL satrni tekshiradi — parametr tartibi
 * tasodifan o'zgarib ketsa darhol ko'rinadi.
 */

const lesson: LinkableLesson = {
  subjectSlug: "fizika",
  grade: 7,
  quarter: 1,
  topicId: "t1",
};

describe("lessonPath", () => {
  it("til prefiksi bilan, parametrlar qotirilgan tartibda", () => {
    expect(lessonPath("uz", lesson)).toBe("/uz/ish/yarat?fan=fizika&sinf=7&chorak=1&mavzu=t1");
  });

  /** `routing.localePrefix === "always"` — prefiks HAR tilda bo'ladi. */
  it("boshqa tillarda prefiks mos keladi", () => {
    expect(lessonPath("ru", lesson)).toBe("/ru/ish/yarat?fan=fizika&sinf=7&chorak=1&mavzu=t1");
    expect(lessonPath("uz-Cyrl", lesson)).toBe(
      "/uz-Cyrl/ish/yarat?fan=fizika&sinf=7&chorak=1&mavzu=t1",
    );
  });

  it("chorak `null` bo'lsa parametr tushib qoladi", () => {
    expect(lessonPath("uz", { ...lesson, quarter: null })).toBe(
      "/uz/ish/yarat?fan=fizika&sinf=7&mavzu=t1",
    );
  });

  it("maxsus belgilar kodlanadi", () => {
    expect(lessonPath("uz", { ...lesson, subjectSlug: "ona tili" })).toContain("fan=ona+tili");
  });
});

describe("lessonUrl", () => {
  it("absolyut havola", () => {
    expect(lessonUrl("https://edudast.uz", "uz", lesson)).toBe(
      "https://edudast.uz/uz/ish/yarat?fan=fizika&sinf=7&chorak=1&mavzu=t1",
    );
  });

  /** Baza manzili yo'q bo'lsa THROW emas — xabar havolasiz ketadi. */
  it("baseUrl `null` -> `null`", () => {
    expect(lessonUrl(null, "uz", lesson)).toBeNull();
  });

  it("bo'sh satr ham `null` deb qaraladi", () => {
    expect(lessonUrl("", "uz", lesson)).toBeNull();
  });
});
