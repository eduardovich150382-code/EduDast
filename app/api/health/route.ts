import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sog'liq tekshiruvi — DB ulanishini haqiqiy so'rov bilan tekshiradi.
 * Bu endpoint build vaqtida chaqirilmaydi (force-dynamic), shuning uchun
 * DATABASE_URL bo'lmagan build'larni buzmaydi.
 */
export async function GET() {
  try {
    const result = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
    return NextResponse.json({
      ok: true,
      db: "up",
      version: result[0]?.version ?? "unknown",
    });
  } catch (error) {
    console.error("[health] DB ulanish xatosi:", error);
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        version: null,
      },
      { status: 503 },
    );
  }
}
