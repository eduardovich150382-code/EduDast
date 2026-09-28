import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CRON_LIMIT, reapStaleDocuments } from "@/lib/generation/reap";

/**
 * Osilib qolgan generatsiyalarni tozalaydigan ZAXIRA ishchi.
 *
 * DIQQAT — BU ASOSIY YO'L EMAS. "RUNNING > 15 daqiqa -> FAILED" va'dasini
 * birinchi navbatda o'qish yo'li bajaradi (`app/api/generate/[id]/holat` va
 * hujjat sahifasi, `after()` ichida). Sabab: Vercel Hobby'da cron KUNIGA
 * BIR marta ishlaydi, ya'ni u 15 daqiqalik va'dani bajara olmaydi.
 *
 * Bu marshrut faqat bitta bo'shliqni yopadi: foydalanuvchi hujjatini
 * umuman ochmay ketib qolsa, uning krediti abadiy band qolmasin.
 *
 * Jadval `vercel.json` da. Naqsh `app/api/cron/embeddings/route.ts` dan.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** `app/api/cron/embeddings/route.ts` dagi bilan bir xil sabab va mantiq. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Sir sozlanmagan bo'lsa endpoint BUTUNLAY YOPIQ: ochiq qolsa har kim
  // begona foydalanuvchilarning generatsiyasini bekor qila olardi.
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET sozlanmagan" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!secretMatches(token, secret)) {
    return NextResponse.json({ ok: false, error: "ruxsat yo'q" }, { status: 401 });
  }

  let reaped = 0;
  let failed = 0;
  let errorKind: string | null = null;

  try {
    const result = await reapStaleDocuments(null, CRON_LIMIT);
    reaped = result.reaped;
    failed = result.failed;
  } catch (error) {
    errorKind = error instanceof Error ? error.name : "unknown";
    console.error("[cron/stale-documents] yiqildi", error);
  }

  // Xato bo'lsa ham HTTP 200: 5xx da Vercel Cron qayta uradi va yiqilgan
  // bazaga qayta-qayta uriladi. Holat javob tanasida.
  return NextResponse.json({ ok: errorKind === null, reaped, failed, errorKind });
}
