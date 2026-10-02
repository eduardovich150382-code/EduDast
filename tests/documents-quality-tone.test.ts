import { describe, expect, it } from "vitest";
import { qualityTone } from "@/lib/documents/quality-tone";
import { SCORE_FAIL, SCORE_WARN } from "@/lib/generation/quality";

/**
 * Chegaralar `quality.ts` DAN IMPORT QILINADI, bu faylda literal yozilmaydi.
 *
 * Sabab: `app/[locale]/ish/hujjat/[id]/page.tsx` past sifat ogohlantirishini
 * aynan `SCORE_WARN` bo'yicha ko'rsatadi. Agar test `0.7` ni qotirib qo'ysa,
 * kelajakda chegara o'zgartirilganda test YASHIL qolib, ro'yxatdagi belgi
 * bilan hujjat ichidagi ogohlantirish jimgina ajralib ketardi — o'qituvchi
 * ro'yxatda "sifat yaxshi" ko'rib, ichida ogohlantirish topardi.
 */

describe("qualityTone — tugamagan hujjatlar", () => {
  it.each([null, 0, 0.3, 0.9, 1])(
    "QUEUED -> neutral (ball=%s bo'lsa ham)",
    (score) => {
      expect(qualityTone("QUEUED", score)).toBe("neutral");
    },
  );

  it.each([null, 0, 0.3, 0.9, 1])(
    "RUNNING -> neutral (ball=%s bo'lsa ham)",
    (score) => {
      // Ball `finishDocument()` da, oxirgi bosqichda yoziladi — bundan
      // oldin u ma'nosiz, shuning uchun ohangga ta'sir qilmasligi kerak.
      expect(qualityTone("RUNNING", score)).toBe("neutral");
    },
  );

  it.each([null, 0, 0.9, 1])("FAILED -> fail (ball=%s bo'lsa ham)", (score) => {
    expect(qualityTone("FAILED", score)).toBe("fail");
  });
});

describe("qualityTone — DONE, chegaralar", () => {
  it("ball yo'q -> neutral", () => {
    expect(qualityTone("DONE", null)).toBe("neutral");
  });

  it("SCORE_WARN dan yuqori yoki teng -> ok", () => {
    expect(qualityTone("DONE", SCORE_WARN)).toBe("ok");
    expect(qualityTone("DONE", SCORE_WARN + 0.01)).toBe("ok");
    expect(qualityTone("DONE", 1)).toBe("ok");
  });

  it("SCORE_WARN dan past, SCORE_FAIL dan yuqori -> warn", () => {
    expect(qualityTone("DONE", SCORE_WARN - 0.01)).toBe("warn");
    expect(qualityTone("DONE", SCORE_FAIL)).toBe("warn");
  });

  it("SCORE_FAIL dan past -> fail (himoya tarmog'i)", () => {
    // `scoreDocument` bunday hujjatni yiqitadi, ya'ni amalda `DONE` +
    // past ball bo'lmasligi kerak. Lekin ball formulasi o'zgarsa, bu
    // tarmoq belgi umuman ko'rinmay qolishidan saqlaydi.
    expect(qualityTone("DONE", SCORE_FAIL - 0.01)).toBe("fail");
    expect(qualityTone("DONE", 0)).toBe("fail");
  });

  it("chegaralar bir-biriga mos tartibda", () => {
    expect(SCORE_FAIL).toBeLessThan(SCORE_WARN);
  });
});
