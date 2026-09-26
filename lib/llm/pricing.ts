import { getPricing } from "./models";
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

/**
 * 2.75 belgi = 1 token — o'zbek lotin matni uchun JONLI O'LCHANGAN.
 *
 * O'LCHOV (2026-09-26, `pnpm llm:smoke`, Gemini `countTokens`): 165 belgili
 * o'zbekcha fizika matni 60 token bergan, ya'ni belgi/token = 2.75. Ilgari
 * bu yerda 3.2 turardi va taxmin haqiqiy sondan 13% PAST chiqardi — bu
 * ikki joyda ham xato tomonga:
 *   - byudjet shifti (`estimateMicros`) haqiqiydan arzon deb baholaydi;
 *   - embedding `LlmCall.tokensIn` i (`embedContent` token qaytarmaydi,
 *     `providers/gemini.ts` ga qarang) kam yozadi va marjani yashiradi.
 *
 * KIRILL VA RUS matnida token yana ko'proq chiqadi (belgi/token kichikroq),
 * ya'ni 2.75 ular uchun HAM past baho bo'lishi mumkin. Taxminni yana
 * pasaytirmaganimiz sababi: `estimateMicros` da boshqa ehtiyot chegaralari
 * bor (chiqishni maksimumning 60% deb oladi, kesh chegirmasini hisobga
 * olmaydi), embedding xarajati esa `EMBEDDING_MODEL.inputPerMTok` ning o'zi
 * tasdiqlanmagan bo'lgani uchun baribir taxminiy.
 *
 * QAYTA O'LCHASH: `pnpm llm:smoke` embedding bo'limi haqiqiy va taxminiy
 * sonni yonma-yon chiqaradi.
 */
const CHARS_PER_TOKEN = 2.75;

/** Belgi sonidan taxminiy token soni. Yuqoriga yaxlitlaydi. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Xarajatni mikrodollarda qaytaradi (butun son). */
export function costMicros(modelId: string, usage: Usage): number {
  const model = getPricing(modelId);
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
  const model = getPricing(modelId);
  if (!model) throw new Error(`Narx jadvalida yo'q model: ${modelId}`);

  const estIn = estimateTokens(promptChars);
  // Model odatda maksimumni to'liq ishlatmaydi — 60 % realistik.
  const estOut = Math.ceil(maxOutputTokens * 0.6);

  return Math.round(
    estIn * microsPerToken(model.inputPerMTok) +
      estOut * microsPerToken(model.outputPerMTok),
  );
}
