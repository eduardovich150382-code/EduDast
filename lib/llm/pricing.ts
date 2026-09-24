import { getModel } from "./models";
import type { Usage } from "./types";

/**
 * Xarajat hisobi.
 *
 * NEGA BUTUN SON: `LlmCall.costUsd` — `Decimal(10,6)`. JS'ning float
 * arifmetikasi 0.1 + 0.2 = 0.30000000000000004 beradi; minglab qator
 * yig'ilganda marja hisobi suziб ketadi. Shuning uchun hamma narsa
 * MIKRODOLLARDA (1e-6 dollar) butun son sifatida hisoblanadi va faqat
 * oxirida satrga aylantiriladi.
 */

/** 1 dollar = 1 000 000 mikrodollar. `Decimal(10,6)` ning aniqligi ham shu. */
const MICRO = 1_000_000;

/** Million token uchun dollar narxini bitta token uchun mikrodollarga. */
function microsPerToken(pricePerMTok: number): number {
  // pricePerMTok dollar / 1e6 token = (pricePerMTok * 1e6) mikrodollar / 1e6 token
  // ya'ni bitta token uchun aynan `pricePerMTok` mikrodollar. Yaxlitlash yo'q.
  return pricePerMTok;
}

/** Xarajatni mikrodollarda qaytaradi (butun son). */
export function costMicros(modelId: string, usage: Usage): number {
  const model = getModel(modelId);
  if (!model) {
    // Noma'lum model — narxni nolga aylantirish marjani yashiradi, shuning
    // uchun ataylab xato tashlaymiz. Reyestrga qo'shilmagan model bilan
    // chaqiruv qilinmasligi kerak.
    throw new Error(`Narx jadvalida yo'q model: ${modelId}`);
  }

  const inMicro = microsPerToken(model.inputPerMTok);
  const outMicro = microsPerToken(model.outputPerMTok);

  const total =
    usage.tokensIn * inMicro +
    usage.tokensOut * outMicro +
    usage.cacheWrite * inMicro * model.cacheWriteMultiplier +
    usage.cacheRead * inMicro * model.cacheReadMultiplier;

  // Koeffitsientlar kasr bo'lishi mumkin (1.25, 0.1) — shu yerda bir marta
  // yaxlitlaymiz, keyin hamma joyda butun son.
  return Math.round(total);
}

/**
 * `Decimal(10,6)` ustuniga to'g'ridan tushadigan 6 xonali o'nlik SATR.
 * Hech qachon `number` qaytarmaydi — Prisma float'ni qabul qilsa ham,
 * u yo'l bilan aniqlik yo'qoladi.
 */
export function costFor(modelId: string, usage: Usage): string {
  return microsToUsd(costMicros(modelId, usage));
}

export function microsToUsd(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(Math.round(micros));
  const whole = Math.floor(abs / MICRO);
  const frac = abs % MICRO;
  return `${sign}${whole}.${String(frac).padStart(6, "0")}`;
}

/**
 * Chaqiruvdan OLDINGI taxminiy xarajat — byudjet shifti uchun.
 *
 * Har chaqiruvga `count_tokens` so'rovi sarflash qimmat va sekin; shift
 * halol turishi uchun ehtiyotkor koeffitsient yetarli. Ataylab yuqoriroq
 * baholaydi: past baho shiftdan oshib ketishga olib keladi.
 */
export function estimateMicros(
  modelId: string,
  promptChars: number,
  maxOutputTokens: number,
): number {
  const model = getModel(modelId);
  if (!model) throw new Error(`Narx jadvalida yo'q model: ${modelId}`);

  // ~3.2 belgi = 1 token. O'zbek lotin matni uchun taxminiy; kirill va rus
  // matnida token ko'proq chiqadi, shuning uchun bu baho past tomonga
  // og'maydi.
  const estIn = Math.ceil(promptChars / 3.2);
  // Model odatda maksimumni to'liq ishlatmaydi — 60 % realistik.
  const estOut = Math.ceil(maxOutputTokens * 0.6);

  return Math.round(
    estIn * microsPerToken(model.inputPerMTok) +
      estOut * microsPerToken(model.outputPerMTok),
  );
}
