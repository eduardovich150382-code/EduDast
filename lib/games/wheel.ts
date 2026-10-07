import { mulberry32, randomInt, shuffle } from "./seed";
import type { BuiltWheel, WheelContent } from "./types";

/**
 * Omad g'ildiragi — sof algoritm (15-sessiya, 2-qatlam).
 *
 * G'ildirakda PANJARA yo'q, shuning uchun qurish ishi kam: sektorlar
 * tartibi va aylantirish ketma-ketligi. Lekin ikkisi ham `seed` dan
 * chiqadi, ya'ni `Math.random` bu yerda ham ishlatilmaydi.
 */

/** Sektor soni — `WheelContent.sectors` dagi `.length(8)` bilan bir qaror. */
export const SECTOR_COUNT = 8;

/** Bitta sektorning burchagi, gradusda. */
export const SECTOR_ANGLE = 360 / SECTOR_COUNT;

export function buildWheel(content: WheelContent, seed: number): BuiltWheel {
  const rng = mulberry32(seed);
  // Sektorlar ARALASHTIRILADI: aks holda `?variant=2` g'ildirakda hech
  // narsani o'zgartirmasdi (mazmun bir xil, panjara esa yo'q).
  return { kind: "wheel", sectors: shuffle(rng, content.sectors) };
}

/**
 * Aylantirish ketma-ketligi — deterministik.
 *
 * KLIENT `Math.random` ISHLATMAYDI: agar ishlatsa, bitta hujjatni ikki
 * marta ochgan o'qituvchi boshqa ketma-ketlik olardi va "bitta hujjat ->
 * bitta o'yin" kafolati faqat panjaraga tegishli bo'lib qolardi.
 *
 * Har element — TO'XTAYDIGAN SEKTOR INDEKSI. Burchakni komponent hisoblaydi
 * (`SECTOR_ANGLE` va bir necha to'liq aylanish), chunki u animatsiyaga
 * tegishli qism.
 *
 * KETMA-KET BIR XIL SEKTOR CHIQMAYDI: ikki marta ketma-ket bir xil savol
 * tushsa, bola "g'ildirak buzilgan" deb o'ylaydi va o'qituvchi savolni
 * qo'lda o'tkazishga majbur bo'ladi.
 */
export function spinSequence(seed: number, count: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];

  for (let i = 0; i < count; i += 1) {
    let next = randomInt(rng, SECTOR_COUNT);
    // Bir urinish yetarli: `SECTOR_COUNT` 8, ya'ni surish ham tasodifiylikni
    // buzmaydi va cheksiz halqa xavfi yo'q.
    if (out.length > 0 && next === out[out.length - 1]) {
      next = (next + 1 + randomInt(rng, SECTOR_COUNT - 1)) % SECTOR_COUNT;
    }
    out.push(next);
  }

  return out;
}
