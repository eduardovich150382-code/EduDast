import type { Block, DocumentContent } from "@/lib/documents/blocks";

/**
 * Taqdimot kontentini pleyer ishlatadigan shaklga keltiradi.
 *
 * NEGA SOF MODUL: bu loyihada React test muhiti yo'q (vitest `node`, jsdom
 * ham, RTL ham yo'q), ya'ni pleyer hook'lari umuman testlanmaydi. Shuning
 * uchun testlanadigan hamma mantiq komponentdan CHIQARILADI va shu yerda
 * yashaydi — `lib/documents/autosave.ts` bilan ayni qaror.
 *
 * Komponentlarga faqat render qoladi.
 */

export type SlideBlock = Extract<Block, { type: "slide" }>;

/**
 * Hujjatdan FAQAT slaydlarni ajratadi.
 *
 * Boshqa bloklar (sarlavha, matn) TASHLANADI, ekranga chiqarilmaydi: hujjat
 * sarlavhasi `Document.title` da bor va u sahifa chrome'ida ko'rinadi, uni
 * slayd sifatida ko'rsatish esa nol-slaydni ikki marta chiqarardi
 * (`slidesOutlineBlocks` qo'ygan `heading` aynan shu).
 *
 * Tartib `contentJson` dagi tartib — `2a` yarmi `2b` dan oldin yoziladi
 * (`commitStage` jsonb append), ya'ni qayta saralash KERAK EMAS va zararli:
 * muharrirda qo'lda ko'chirilgan slayd o'z joyida qolishi kerak.
 */
export function deckSlides(content: DocumentContent): SlideBlock[] {
  return content.blocks.filter((block): block is SlideBlock => block.type === "slide");
}

/**
 * Notiq ko'rinishi uchun joriy va keyingi slayd.
 *
 * `next` — `null` oxirgi slaydda. Chegaradan chiqqan indeks ham `null`
 * beradi va THROW QILMAYDI: indeks `IntersectionObserver` dan keladi, u esa
 * taqdimot tahrirlanib slayd o'chirilganda bir render orqada qolishi mumkin.
 */
export function presenterView(
  slides: readonly SlideBlock[],
  index: number,
): { current: SlideBlock | null; next: SlideBlock | null } {
  return {
    current: slides[index] ?? null,
    next: slides[index + 1] ?? null,
  };
}

/**
 * `two-column` ko'rinishining ustunlari.
 *
 * Punktlar KETMA-KET yarmiga bo'linadi: birinchi yarmi chap ustunda, qolgani
 * o'ngda. Juft-toq navbatlashtirish (`i % 2`) ATAYLAB ishlatilmagan — u
 * ro'yxatning o'qilish tartibini buzadi: "1, 3, 5" va "2, 4, 6" ustunlari
 * mazmunan bog'liq bandlarni ajratib tashlardi.
 *
 * Toq sonda chap ustun kattaroq bo'ladi (`ceil`), chunki ko'z chapdan
 * boshlaydi va uzunroq ustun yuqoridan ko'rinadi.
 */
export function twoColumns(bullets: readonly string[]): {
  left: string[];
  right: string[];
} {
  const half = Math.ceil(bullets.length / 2);
  return { left: bullets.slice(0, half), right: bullets.slice(half) };
}

/**
 * `quote` ko'rinishining qismlari.
 *
 * Birinchi punkt — iqtibosning O'ZI (katta shriftda markazda), ikkinchisi
 * muallif yoki manba. Uchinchi va keyingilari TASHLANADI: iqtibos slaydida
 * ro'yxat bo'lmaydi, u `bullets` ko'rinishining ishi.
 *
 * Punkt umuman bo'lmasa `quote` `null` qaytadi va render sarlavhaning o'ziga
 * tushadi — model `section` ga o'xshash narsa yuborgan holat.
 */
export function quoteParts(bullets: readonly string[]): {
  quote: string | null;
  source: string | null;
} {
  return { quote: bullets[0] ?? null, source: bullets[1] ?? null };
}

/** "3/12" yorlig'i uchun raqamlar. Indeks NOLDAN, yorliq BIRDAN. */
export function slideLabel(index: number, total: number): { index: number; total: number } {
  return { index: Math.min(index + 1, Math.max(total, 1)), total };
}
