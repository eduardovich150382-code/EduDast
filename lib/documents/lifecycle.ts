import type { PrismaClient } from "@/lib/generated/prisma/client";
import { DocumentContent, type Block } from "./blocks";

/**
 * Hujjat generatsiyasining ATOMAR o'tishlari.
 *
 * NEGA HAMMASI RAW SQL: Prisma `where` da na `"startedAt" < NOW() - interval`
 * ni, na `jsonb ||` append'ni ifodalay oladi, `jsonb_set` esa umuman yo'q.
 * Bu ikkalasi ham poyga darvozasining O'ZI — ularni ikki so'rovga bo'lish
 * darvozani yo'q qiladi (`lib/curriculum/search.ts` bilan bir xil sabab).
 *
 * VAQT — BAZA SOATI (`NOW()`). Lambda soati ishlatilsa, ikki mintaqadagi
 * ikki instansiya bir-birining ijarasini noto'g'ri baholaydi.
 *
 * XAVFSIZLIK: barcha qiymatlar tagged template orqali PARAMETR sifatida
 * uzatiladi — satr birikmasi yo'q.
 */

/**
 * Ijara muddati. `maxDuration = 60` dan KATTA bo'lishi SHART: tirik lambda
 * majburan 60 soniyada o'ladi, ya'ni u hech qachon o'z ijarasini yo'qotmaydi;
 * o'lgan lambda esa 90 soniyadan keyin albatta qo'yib yuboradi.
 */
export const LEASE_SECONDS = 90;

/** Bir bosqich uchun eng ko'p urinish. Oshsa — `release`, pul qaytadi. */
export const MAX_ATTEMPTS = 3;

/** Yetim `RUNNING` hujjat shu muddatdan keyin FAILED qilinadi. */
export const STALE_MINUTES = 15;

/** Bitta `commitStage` ga sig'adigan eng katta payload (belgi). */
const MAX_PAYLOAD_CHARS = 200_000;

export type ClaimedStage = {
  topicId: string;
  creditsHeldFor: number;
  inputParams: unknown;
  /** Joriy urinish raqami (1 dan boshlanadi). */
  attempts: number;
};

type QueryDb = Pick<PrismaClient, "$queryRaw">;
type ExecDb = Pick<PrismaClient, "$executeRaw">;

/**
 * AYNAN bitta bosqichni egallaydi. Egallay olmasa `null`.
 *
 * NEGA `status` DARVOZA EMAS: hujjat bosqichlar orasida `RUNNING` da QOLADI —
 * ko'ruvchi yarim tayyor bloklarni ko'rsatishi kerak. Demak
 * `status IN ('QUEUED','RUNNING')` ikkinchi POST'ni to'smaydi. Haqiqiy
 * darvoza — (kursor, ijara) juftligi.
 *
 * NEGA IJARA SHARTI `attempts` GA TAYANADI, `startedAt` GA EMAS:
 * `commitStage` oxirida `startedAt = NOW()` qo'yiladi (reaper unga tayanadi).
 * Agar ijara sharti sof `"startedAt" < NOW() - 90s` bo'lsa, 1-bosqich tugagach
 * 2-bosqich 90 soniya davomida EGALLANMAS edi: klient 409 tsiklida aylanib,
 * uch bosqichli konveyer ~3 daqiqaga cho'zilardi. `commitStage` `attempts` ni
 * 0 ga qaytargani uchun keyingi bosqich DARHOL egallanadi; parallel POST'da
 * esa birinchisi `attempts` ni 1 qiladi va ikkinchisi ikkala shartdan ham
 * o'tolmaydi.
 *
 * NEGA POYGAGA CHIDAMLI: bu BITTA `UPDATE` operatori. Postgres qatorni
 * QULFLAYDI va `WHERE` ni qulflangan, eng yangi qator ustida qayta baholaydi
 * (`lib/credits/ledger.ts:hold` dagi bilan aynan bir xil dalil).
 *
 * NEGA `$queryRaw ... RETURNING`, alohida `findUnique` EMAS: `creditsHeldFor`
 * va `inputParams` qulflangan qatorning O'ZIDAN keladi. Alohida o'qilsa,
 * o'qish bilan qulf orasiga ikkinchi chaqiruv sig'adi.
 */
export async function claimStage(
  db: QueryDb,
  args: { documentId: string; userId: string; stage: number },
): Promise<ClaimedStage | null> {
  const rows = await db.$queryRaw<ClaimedStage[]>`
    UPDATE "Document"
    SET "status"      = 'RUNNING',
        "startedAt"   = NOW(),
        "inputParams" = jsonb_set(
          "inputParams",
          '{progress,attempts}',
          to_jsonb(COALESCE(("inputParams" #>> '{progress,attempts}')::int, 0) + 1)
        )
    WHERE "id"     = ${args.documentId}
      AND "userId" = ${args.userId}
      AND "deletedAt" IS NULL
      AND "status" IN ('QUEUED', 'RUNNING')
      AND COALESCE(("inputParams" #>> '{progress,stage}')::int, 0) = ${args.stage}
      AND (
        COALESCE(("inputParams" #>> '{progress,attempts}')::int, 0) = 0
        OR "startedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS})
      )
    RETURNING "topicId",
              "creditsHeldFor",
              "inputParams",
              ("inputParams" #>> '{progress,attempts}')::int AS "attempts"
  `;
  return rows[0] ?? null;
}

/**
 * Bosqich natijasini yozadi VA kursorni suradi — BITTA operator.
 *
 * BU ASOSIY POYGA DARVOZASI. Ijara muddati o'tib ikkita ishchi AYNI bosqichni
 * bajarib qo'ysa ham (masalan model 100 soniya javob bermadi), faqat BIRI
 * `count === 1` oladi: birinchisi kursorni N -> N+1 qiladi, ikkinchisi
 * qulflangan qatorda `stage = N` shartini qayta baholaydi va 0 ko'radi.
 * Yutqazgan ishchi bloklarini TASHLAB YUBORADI — duplikat blok STRUKTURA
 * darajasida imkonsiz.
 *
 * NEGA READ-MODIFY-WRITE POYGASI YO'Q: `contentJson` hech qachon Node tomonga
 * o'qib olinib, massivga `push` qilinib, qayta yozilmaydi. Append `jsonb ||`
 * bilan qulflangan qatorda bajariladi, ya'ni lost update imkonsiz — bu ijara
 * ishlayaptimi yoki yo'qmi, unga bog'liq emas.
 *
 * @param progressPatch `progress` ga qo'shiladigan kalitlar (masalan
 *        1-bosqich rejani aniqlagach `{ total }` — `lib/generation/plans.ts`).
 *        `stage` va `attempts` bu yerda MAJBURAN o'rnatiladi, patch ularni
 *        bekor qila olmaydi.
 * @param paramsPatch `inputParams` ning YUQORI qatlamiga qo'shiladigan
 *        kalitlar (1-bosqich `skeleton` ni shu yo'l bilan saqlaydi — u
 *        `contentJson` ga sig'maydi, chunki `stages` bloki harakatlarsiz
 *        haqiqiy emas).
 * @returns `true` — yozildi; `false` — kursor allaqachon surilgan, natija
 *        tashlandi.
 */
export async function commitStage(
  db: ExecDb,
  args: {
    documentId: string;
    userId: string;
    stage: number;
    blocks: Block[];
    progressPatch?: Record<string, number>;
    paramsPatch?: Record<string, unknown>;
  },
): Promise<boolean> {
  // Bazaga faqat TEKSHIRILGAN ma'lumot tushadi (`lib/llm/structured.ts`
  // falsafasi). Bu yerda yiqilsa — bu bizning o'girish kodimizdagi xato,
  // model xatosi emas: model chiqishi allaqachon Zod'dan o'tgan.
  DocumentContent.parse({ v: 1, blocks: args.blocks });

  const payload = JSON.stringify(args.blocks);
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error(
      `Bosqich natijasi juda katta: ${String(payload.length)} belgi (shift ${String(MAX_PAYLOAD_CHARS)})`,
    );
  }

  // `stage` va `attempts` PATCH'DAN KEYIN qo'yiladi — chaqiruvchi tasodifan
  // kursorni o'zi surib yubora olmasin.
  const progressPatch = JSON.stringify({
    ...args.progressPatch,
    stage: args.stage + 1,
    attempts: 0,
  });
  const paramsPatch = JSON.stringify(args.paramsPatch ?? {});

  // Bitta operator, tarmoqsiz. `||` jsonb obyektlarini SAYOZ birlashtiradi,
  // shuning uchun `progress` alohida birlashtirilib, keyin yuqori qatlamga
  // qo'yiladi — aks holda u butunlay almashib, `total` yo'qolardi.
  const count = await db.$executeRaw`
    UPDATE "Document"
    SET "contentJson" = jsonb_set(
          "contentJson",
          '{blocks}',
          COALESCE("contentJson" -> 'blocks', '[]'::jsonb) || ${payload}::jsonb
        ),
        "inputParams" = "inputParams"
          || ${paramsPatch}::jsonb
          || jsonb_build_object(
               'progress',
               COALESCE("inputParams" -> 'progress', '{}'::jsonb) || ${progressPatch}::jsonb
             ),
        "startedAt"   = NOW()
    WHERE "id"     = ${args.documentId}
      AND "userId" = ${args.userId}
      AND "deletedAt" IS NULL
      AND "status" = 'RUNNING'
      AND ("inputParams" #>> '{progress,stage}')::int = ${args.stage}
  `;

  return count === 1;
}

export type StaleDocument = { id: string; userId: string; creditsHeldFor: number };

/**
 * Yetim `RUNNING` hujjatlarni topadi. Kreditni QAYTARMAYDI — buni chaqiruvchi
 * `lib/credits/ledger.ts:release` bilan qiladi (pulga tegadigan yagona joy).
 *
 * NEGA CRON EMAS, O'QISHDA: Vercel Hobby'da cron KUNIGA BIR marta ishlaydi
 * (`vercel.json`), ya'ni "RUNNING > 15 daqiqa -> FAILED" va'dasini cron
 * bajara olmaydi. Yetim hujjati bor foydalanuvchi — aynan holatni so'rab
 * turgan odam, demak tozalash uning o'z so'rovida bepul bajariladi.
 * `app/api/cron/stale-documents` esa qaytmaydigan foydalanuvchilar uchun
 * ZAXIRA, asosiy yo'l emas.
 *
 * @param userId `null` — hamma foydalanuvchi (faqat cron shunday chaqiradi).
 */
export async function findStaleDocuments(
  db: QueryDb,
  args: { userId: string | null; limit: number },
): Promise<StaleDocument[]> {
  const staleBefore = `${String(STALE_MINUTES)} minutes`;

  if (args.userId === null) {
    return db.$queryRaw<StaleDocument[]>`
      SELECT "id", "userId", "creditsHeldFor"
      FROM "Document"
      WHERE "status" = 'RUNNING'
        AND "deletedAt" IS NULL
        AND "startedAt" < NOW() - ${staleBefore}::interval
      ORDER BY "startedAt" ASC
      LIMIT ${args.limit}
    `;
  }

  return db.$queryRaw<StaleDocument[]>`
    SELECT "id", "userId", "creditsHeldFor"
    FROM "Document"
    WHERE "userId" = ${args.userId}
      AND "status" = 'RUNNING'
      AND "deletedAt" IS NULL
      AND "startedAt" < NOW() - ${staleBefore}::interval
    ORDER BY "startedAt" ASC
    LIMIT ${args.limit}
  `;
}
