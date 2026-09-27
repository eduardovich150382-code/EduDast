import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LEASE_SECONDS } from "@/lib/documents/lifecycle";
import { runStage } from "@/lib/generation/run-stage";

/**
 * AYNAN BITTA generatsiya bosqichini bajaradi.
 *
 * NEGA BITTA UZUN SSE EMAS:
 *   - Vercel Hobby'da funksiya 60 soniyadan uzun ishlamaydi;
 *   - har bosqich mustaqil qayta urinuvchan;
 *   - uzilgan mobil ulanish ko'pi bilan BITTA bosqichni yo'qotadi;
 *   - progress bazadagi haqiqiy holat, xotiradagi oqim emas.
 *
 * Bosqich raqami TANADAN OLINMAYDI — server uni `inputParams.progress` dan
 * o'zi o'qiydi. Mijoz kursorni surishga ta'sir qila olmasligi kerak.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Bitta LLM chaqiruvi — sukutdagi 10 soniya yetmaydi. */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await auth();
  // `requireAuth()` EMAS: u `redirect()` qiladi, API mijoziga esa 302
  // o'rniga aniq 401 kerak.
  if (!user) {
    return NextResponse.json({ ok: false, error: "kirilmagan" }, { status: 401 });
  }

  const { id } = await params;
  const outcome = await runStage({ documentId: id, userId: user.id });

  switch (outcome.kind) {
    case "advanced":
      return NextResponse.json({
        ok: true,
        status: "RUNNING",
        stage: outcome.stage,
        total: outcome.total,
      });

    case "done":
      return NextResponse.json({ ok: true, status: "DONE", score: outcome.score });

    case "busy":
      // Boshqa ishchi shu bosqichni egallagan. Mijoz holatni so'rab,
      // kursorni yangilab qayta uradi.
      return NextResponse.json({ ok: false, error: "band", retryable: true }, { status: 409 });

    case "retry":
      // Kredit BAND qoladi: ijara bo'shagach ayni bosqich qayta egallanadi.
      return NextResponse.json(
        {
          ok: false,
          error: "vaqtinchalik",
          retryable: true,
          retryAfterSeconds: LEASE_SECONDS,
          reason: outcome.reason,
        },
        { status: 503, headers: { "retry-after": String(LEASE_SECONDS) } },
      );

    case "failed":
      // 200, 5xx EMAS: bu kutilgan yakun (kredit qaytarildi), server
      // nosozligi emas. 5xx bo'lsa mijoz qayta urinib, kreditni yana
      // band qilardi.
      return NextResponse.json({ ok: false, status: "FAILED", reason: outcome.reason });

    case "complete":
      return NextResponse.json({ ok: true, status: "DONE" });

    case "notFound":
      return NextResponse.json({ ok: false, error: "topilmadi" }, { status: 404 });
  }
}
