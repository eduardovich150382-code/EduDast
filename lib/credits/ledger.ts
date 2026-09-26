import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  CreditError,
  CreditUserNotFound,
  DocumentNotRunning,
  HoldMismatch,
  InsufficientCredits,
} from "./errors";

/**
 * Kredit daftari — pulga tegadigan YAGONA joy (CLAUDE.md 4-qoida).
 *
 * OQIM: `hold` → generatsiya → muvaffaqiyat bo'lsa `charge`, xato bo'lsa
 * `release`. Band qilingan kredit `User.creditsHeld` da yashaydi, mavjud
 * balans = `creditBalance - creditsHeld`. Shu sababli `CreditTx` ga faqat pul
 * HAQIQATAN qimirlaganda qator tushadi: `hold` va `release` daftarga hech
 * narsa yozmaydi.
 *
 * TRANZAKSIYA ICHIDA TARMOQ CHAQIRUVI YO'Q. Bu qatlam faqat SQL bajaradi.
 * LLM chaqiruvini kredit tranzaksiyasi ichiga o'rash Prisma'ning 5 sekundlik
 * sukut cheklovini (`P2028`) oshiradi va rollback xato sababini o'chirib
 * yuboradi — `lib/curriculum/embed.ts` dagi `embedTopics` /
 * `writeTopicVectors` ajratilishi aynan shu sababdan.
 *
 * XAVFSIZLIK: barcha qiymatlar tagged template orqali PARAMETR sifatida
 * uzatiladi — satr birikmasi yo'q, SQL injection yo'q
 * (`lib/curriculum/search.ts` konvensiyasi).
 */

/**
 * `hold()` ning klienti — FAQAT `$executeRaw`.
 *
 * NEGA `CreditDb` EMAS: Prisma'ning interaktiv tranzaksiya klientida
 * `$transaction` YO'Q, 08-sessiya esa `hold()` ni aynan tranzaksiya ichidan
 * chaqiradi (`$transaction[ hold(cost), Document.create(QUEUED) ]`). Turni
 * tor ushlash o'sha chaqiruvni kompilyatsiyada o'tkazadi.
 */
export type HoldDb = Pick<PrismaClient, "$executeRaw">;

/** Tranzaksiya ICHIDA ishlatiladigan minimal klient — `tx` shu turga mos. */
type TxDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "creditTx" | "document">;

/** Tranzaksiyani OCHA oladigan klient. */
export type CreditDb = TxDb & Pick<PrismaClient, "$transaction">;

/**
 * `db` berilmasa — ilovaning odatdagi klienti.
 *
 * Import ATAYLAB dinamik: `lib/db.ts` modul yuklanishida `DATABASE_URL` bilan
 * klient quradi, `tests/integration/credits-race.test.ts` esa o'zining
 * `TEST_DATABASE_URL` klientini uzatadi va asosiy bazadagi balansga
 * tegmasligi SHART (`lib/curriculum/search.ts:resolveDb` naqshi).
 */
async function resolveDb<T>(db: T | undefined): Promise<T> {
  if (db) return db;
  const { prisma } = await import("@/lib/db");
  return prisma as T;
}

/**
 * Bir amalda o'tadigan eng katta miqdor.
 *
 * Qo'l xatosi qorovuli: admin 50 o'rniga 50000 yozib yuborsa cheklovga
 * uriladi (`server/credit-actions.ts` Zod'da yana bir marta tekshiradi).
 */
const MAX_AMOUNT = 10_000;

/** `failReason` — foydalanuvchiga ko'rinadigan qisqa sabab, roman emas. */
const FAIL_REASON_MAX = 500;

/**
 * Tranzaksiya cheklovi.
 *
 * `lib/db.ts` da `transactionOptions` yo'q, ya'ni sukut 5 s (`P2028`). Bu
 * yerdagi amallar ~2 s dan kam (uch SQL operatori, tarmoq chaqiruvi yo'q) —
 * 10 s faqat Neon sovuq starti va tarmoq tishlashi uchun zaxira. Global
 * sozlamani oshirmadik: u `writeTopicVectors` kabi boshqa tranzaksiyalar
 * uchun ham 5 s qorovulini jimgina bo'shatib qo'yardi.
 */
const TX_OPTIONS = { timeout: 10_000 } as const;

function assertAmount(amount: number, ctx: { userId: string; documentId?: string }): void {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new CreditError("invalid_amount", `Noto'g'ri kredit miqdori: ${amount}`, {
      ...ctx,
      amount,
    });
  }
}

/**
 * Kreditni BAND qiladi. `CreditTx` YOZILMAYDI — hech narsa qimirlamadi
 * (CLAUDE.md 4-qoida). Manfiy `CreditTx` bilan hold qilish ATAYLAB yo'q.
 *
 * O'QIB-KEYIN-YOZISH EMAS, BITTA OPERATOR. Prisma `where` da ustunni ustunga
 * solishtira olmaydi (`creditBalance - creditsHeld >= amount`) — shuning uchun
 * `$executeRaw`.
 *
 * NEGA BU POYGAGA CHIDAMLI: `UPDATE` qatorni QULFLAYDI va `WHERE` shartini
 * qulflangan, eng yangi qator ustida qayta baholaydi. Balansi 7 bo'lgan
 * foydalanuvchiga 20 ta parallel `hold(1)` kelsa, Postgres ularni navbatga
 * qo'yadi va aniq 7 tasi o'tadi — `tests/integration/credits-race.test.ts`
 * shuni haqiqiy bazada tekshiradi.
 *
 * `deletedAt IS NULL` — QO'LDA yozilgan. Raw SQL Prisma'ning soft delete
 * mantig'idan o'tmaydi: unutilsa o'chirilgan hisobdan pul yechiladi.
 *
 * `documentId` bazaga YOZILMAYDI (hold daftarga tegmaydi) — u faqat
 * `InsufficientCredits` xatosiga kontekst beradi. Band qilingan miqdorning
 * o'zi `Document.creditsHeldFor` da saqlanadi va uni chaqiruvchi shu bilan
 * BIR tranzaksiyada yozadi (08-sessiya; sxemadagi izohga qarang).
 */
export async function hold(
  userId: string,
  amount: number,
  documentId: string,
  opts: { db?: HoldDb } = {},
): Promise<void> {
  assertAmount(amount, { userId, documentId });
  const db = await resolveDb<HoldDb>(opts.db);

  const rows = await db.$executeRaw`
    UPDATE "User"
    SET "creditsHeld" = "creditsHeld" + ${amount}
    WHERE "id" = ${userId}
      AND "deletedAt" IS NULL
      AND "creditBalance" - "creditsHeld" >= ${amount}
  `;

  if (rows === 0) throw new InsufficientCredits({ userId, amount, documentId });
}

/**
 * Kreditni YECHADI va hujjatni `DONE` qiladi — BITTA tranzaksiyada.
 *
 * NEGA AJRATILMAYDI: agar pul yechish va `DONE` yozish ikki amal bo'lsa,
 * birinchisi o'tib ikkinchisi yetmasa (jarayon o'ldi) — keyingi urinish yana
 * pul yechardi. Bitta tranzaksiyada esa hujjat darvozasi yiqilsa balans ham
 * qaytadi, ya'ni ikki marta yechish STRUKTURA darajasida imkonsiz.
 *
 * `creditsUsed` `amount` argumentidan yoziladi, `creditCost()` bilan qayta
 * hisoblanmaydi: chaqiruvchi (08-sessiya) `hold` va `charge` ga AYNI sonni
 * uzatishi shart, aks holda narx jadvali o'zgargach eski hujjatlar noto'g'ri
 * hisoblanadi.
 *
 * @returns yechilgandan KEYINGI balans (`CreditTx.balanceAfter` bilan bir xil)
 */
export async function charge(
  userId: string,
  amount: number,
  documentId: string,
  opts: { db?: CreditDb } = {},
): Promise<number> {
  assertAmount(amount, { userId, documentId });
  const db = await resolveDb<CreditDb>(opts.db);

  return db.$transaction(async (tx) => {
    // 1-QADAM. `$executeRaw` EMAS, `$queryRaw`: `$executeRaw` faqat qator
    // SONINI qaytaradi va `RETURNING` natijasini tashlab yuboradi. Bizga esa
    // aynan shu yangi balans kerak.
    const rows = await tx.$queryRaw<Array<{ creditBalance: number }>>`
      UPDATE "User"
      SET "creditBalance" = "creditBalance" - ${amount},
          "creditsHeld"   = "creditsHeld"   - ${amount}
      WHERE "id" = ${userId}
        AND "deletedAt" IS NULL
        AND "creditsHeld"   >= ${amount}
        AND "creditBalance" >= ${amount}
      RETURNING "creditBalance"
    `;
    if (rows.length === 0) throw new HoldMismatch({ userId, amount, documentId });
    const balanceAfter = rows[0]!.creditBalance;

    // 2-QADAM. `balanceAfter` AYNAN shu tranzaksiyadagi `RETURNING` dan.
    // Oldingi o'qishdan olinsa, parallel ikki amal bir xil son yozardi va
    // daftar haqiqatdan uzilardi (lost update).
    await tx.creditTx.create({
      data: { userId, delta: -amount, reason: "GENERATION", refId: documentId, balanceAfter },
    });

    // 3-QADAM. Idempotentlik darvozasi. `status: "RUNNING"` sharti AYNI
    // so'rovda: avval o'qib keyin yozilsa, orasiga ikkinchi chaqiruv sig'adi.
    const updated = await tx.document.updateMany({
      where: { id: documentId, userId, status: "RUNNING", deletedAt: null },
      data: { status: "DONE", creditsUsed: amount },
    });
    if (updated.count !== 1) throw new DocumentNotRunning({ userId, amount, documentId });

    return balanceAfter;
  }, TX_OPTIONS);
}

/**
 * Bandni BO'SHATADI va hujjatni `FAILED` qiladi — bitta tranzaksiyada.
 *
 * `CreditTx` YOZILMAYDI: pul qimirlamadi, `creditBalance` tegilmadi. Daftarga
 * "0 delta" qator yozish uni shovqinga ko'mardi va 4-qoidani
 * soxtalashtirardi.
 *
 * KONTRAKT: statusni SHU FUNKSIYA `FAILED` ga o'tkazadi. Chaqiruvchi bundan
 * OLDIN statusni qo'lda o'zgartirmasin — aks holda darvoza `count === 0`
 * ko'radi, `DocumentNotRunning` tashlanadi va rollback kreditni BAND holatida
 * qoldiradi (ya'ni xatoni "tuzatish" urinishi kreditni yo'q qiladi).
 *
 * `deletedAt IS NULL` sharti `User` da ATAYLAB YO'Q (`hold`/`charge` dan
 * farqli): o'chirilgan foydalanuvchining bandi ham bo'shashi kerak, aks holda
 * `creditsHeld` abadiy oshgan yetim qator qoladi.
 */
export async function release(
  userId: string,
  amount: number,
  documentId: string,
  failReason: string,
  opts: { db?: CreditDb } = {},
): Promise<void> {
  assertAmount(amount, { userId, documentId });
  const db = await resolveDb<CreditDb>(opts.db);

  await db.$transaction(async (tx) => {
    // `RETURNING` kerak emas — `creditBalance` o'zgarmaydi, shuning uchun
    // `$executeRaw` (qator soni yetarli).
    const rows = await tx.$executeRaw`
      UPDATE "User"
      SET "creditsHeld" = "creditsHeld" - ${amount}
      WHERE "id" = ${userId}
        AND "creditsHeld" >= ${amount}
    `;
    if (rows === 0) throw new HoldMismatch({ userId, amount, documentId });

    const updated = await tx.document.updateMany({
      where: { id: documentId, userId, status: { in: ["QUEUED", "RUNNING"] }, deletedAt: null },
      data: { status: "FAILED", failReason: failReason.slice(0, FAIL_REASON_MAX) },
    });
    if (updated.count !== 1) throw new DocumentNotRunning({ userId, amount, documentId });
  }, TX_OPTIONS);
}

/**
 * Balansni OSHIRADI + daftarga musbat qator — `grant` va `purchase` uchun
 * umumiy tana.
 *
 * NEGA UMUMIY: ikki nusxa qilinsa biri `balanceAfter` ni oldingi o'qishdan
 * olib qo'yadi yoki `CreditTx` ni butunlay unutadi.
 */
async function addCredits(
  userId: string,
  amount: number,
  reason: "GRANT" | "PURCHASE",
  refId: string | null,
  opts: { db?: CreditDb } = {},
): Promise<number> {
  assertAmount(amount, { userId });
  const db = await resolveDb<CreditDb>(opts.db);

  return db.$transaction(async (tx) => {
    // `$queryRaw` + `RETURNING`: `balanceAfter` oldingi o'qishdan olinmasin.
    // Prisma `update` ham yangi qatorni qaytaradi, lekin raw SQL `charge`
    // bilan bir xil shaklni saqlaydi va `deletedAt` sharti ko'rinib turadi.
    const rows = await tx.$queryRaw<Array<{ creditBalance: number }>>`
      UPDATE "User"
      SET "creditBalance" = "creditBalance" + ${amount}
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      RETURNING "creditBalance"
    `;
    if (rows.length === 0) throw new CreditUserNotFound({ userId, amount });
    const balanceAfter = rows[0]!.creditBalance;

    await tx.creditTx.create({ data: { userId, delta: amount, reason, refId, balanceAfter } });
    return balanceAfter;
  }, TX_OPTIONS);
}

/**
 * Admin sovg'asi (beta o'qituvchilari, kompensatsiya).
 *
 * `refId` — KIM berdi (`admin:<userId>`). Grant real pul qiymati, shuning
 * uchun kim bergani daftarda qolishi shart.
 */
export function grant(
  userId: string,
  amount: number,
  refId: string,
  opts: { db?: CreditDb } = {},
): Promise<number> {
  return addCredits(userId, amount, "GRANT", refId, opts);
}

/**
 * To'lov tasdiqlangandan keyin kredit qo'shish. `refId` — `PaymentIntent.id`.
 *
 * 18-SESSIYA UCHUN: hozir chaqiruvchisi yo'q, lekin daftar mantig'i `grant`
 * bilan bir xil bo'lishi kerak — shuning uchun hozir yozildi va testi bor.
 */
export function purchase(
  userId: string,
  amount: number,
  paymentIntentId: string,
  opts: { db?: CreditDb } = {},
): Promise<number> {
  return addCredits(userId, amount, "PURCHASE", paymentIntentId, opts);
}
