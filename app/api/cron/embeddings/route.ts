import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { EMBED_BATCH, isLlmError } from "@/lib/llm";
import {
  countStaleTopics,
  embedTopics,
  findStaleTopics,
  writeTopicVectors,
} from "@/lib/curriculum/embed";

/**
 * Eskirgan mavzu embeddinglarini to'ldiradigan Vercel Cron ishchisi.
 *
 * NAVBAT INFRATUZILMASI YO'Q (Redis/queue kerak emas): `embeddedAt IS NULL`
 * ning o'zi navbat, bu marshrut esa ishchi. Jadval kichik, kunda bir marta
 * yetadi.
 *
 * Jadval `vercel.json` da. Hobby rejasida cron faqat KUNLIK bo'lishi mumkin.
 */

export const dynamic = "force-dynamic";
/** 200 qator × tarmoq chaqiruvi — sukutdagi 10 s yetmaydi. */
export const maxDuration = 60;

/** Bitta chaqiruvda yoziladigan maksimal qator. */
const MAX_PER_RUN = 200;

/**
 * Sirni uzunlik oshkor qilmasdan taqqoslaydi.
 *
 * `timingSafeEqual` uzunliklar teng bo'lmasa THROW qiladi, shuning uchun
 * uzunlikni oldin tekshirib bo'lmaydi — ikkalasini hash qilib solishtirish
 * o'rniga eng soddasi: uzunlik farq qilsa darhol `false`. Sir uzunligi
 * maxfiy emas, taqqoslash vaqti esa shu holatda ham sirning MAZMUNINI
 * oshkor qilmaydi.
 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Sir sozlanmagan bo'lsa endpoint BUTUNLAY YOPIQ — bu ataylab, aynan
  // `TELEGRAM_WEBHOOK_SECRET` bilan bir xil mantiq. Ochiq qolishi har
  // kim pul sarflatishi mumkin degani.
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET sozlanmagan" },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!secretMatches(token, secret)) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 401 });
  }

  const scope = {};
  let written = 0;
  let batches = 0;
  let stalled = false;
  let errorKind: string | null = null;

  try {
    while (written < MAX_PER_RUN) {
      const limit = Math.min(EMBED_BATCH, MAX_PER_RUN - written);
      const topics = await findStaleTopics(prisma, { ...scope, limit });
      if (topics.length === 0) break;

      batches += 1;

      // TARMOQ — tranzaksiyadan TASHQARIDA (lib/curriculum/embed.ts izohi).
      const vectors = await embedTopics(topics, { userId: null });

      // Har partiya alohida commit: o'rtada yiqilsa yozilgani qoladi.
      const count = await prisma.$transaction((tx) => writeTopicVectors(tx, topics, vectors));

      // CHEKSIZ AYLANMA QALQONI — skriptdagi bilan bir xil sabab:
      // `UPDATE` da `AND "deletedAt" IS NULL` bor, ya'ni tanlangan mavzu
      // o'chirilgan bo'lsa ayni partiya qayta-qayta tanlanardi.
      if (count === 0) {
        stalled = true;
        console.error(
          `[cron/embeddings] ${topics.length} ta tanlandi, 0 ta yozildi — aylanma to'xtatildi.`,
        );
        break;
      }

      written += count;
    }
  } catch (error) {
    // Xato sababi `LlmCall.errorKind` da allaqachon yozilgan — alohida
    // jurnal qurmaymiz. Shu yerda faqat qisqa iz qoldiramiz.
    errorKind = isLlmError(error) ? error.kind : "unknown";
    console.error("[cron/embeddings] partiya yiqildi", { errorKind, written });
  }

  const remaining = await countStaleTopics(prisma, scope);

  // Xato bo'lsa ham HTTP 200: Vercel Cron 5xx da qayta uradi va yiqilgan
  // provayderga qayta-qayta pul sarflardi. Holat javob tanasida.
  return NextResponse.json({
    ok: errorKind === null && !stalled,
    written,
    batches,
    remaining,
    stalled,
    errorKind,
  });
}
