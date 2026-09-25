import { config } from "dotenv";
import { z } from "zod";

/**
 * Uchidan-uchiga sinov: ikkala provayderga bittadan chaqiruv qiladi va
 * bazaga yozilgan `LlmCall` qatorini ko'rsatadi.
 *
 *   pnpm llm:smoke
 *
 * Byudjet shiftini sinash uchun:
 *   LLM_MONTHLY_BUDGET_USD=0 pnpm llm:smoke
 * (tarmoqqa umuman chiqmasdan xato qaytishi kerak)
 */

config({ path: ".env.local" });

const Answer = z.object({
  javob: z.string().describe("Bir jumlalik javob, o'zbek tilida (lotin)"),
  ishonch: z.number().min(0).max(1),
});

async function main() {
  // Import DINAMIK: dotenv .env.local ni o'qib bo'lgandan keyin modullar
  // yuklanishi kerak, aks holda kalitlar ko'rinmaydi.
  const { runLlm, isLlmError } = await import("../lib/llm");
  const { setProvider } = await import("../lib/llm/providers/registry");
  const { prisma } = await import("../lib/db");

  const providers = (
    [
      ["anthropic", process.env.ANTHROPIC_API_KEY],
      ["gemini", process.env.GOOGLE_API_KEY],
    ] as const
  ).filter(([, key]) => Boolean(key));

  if (providers.length === 0) {
    console.error(
      "Na ANTHROPIC_API_KEY, na GOOGLE_API_KEY sozlanmagan. .env.local ga qo'ying.",
    );
    process.exitCode = 1;
    return;
  }

  // Byudjet qorovuli GENERATION_ENABLED != "true" bo'lsa har chaqiruvni
  // `disabled` bilan rad etadi — bu ataylab (avariya tugmasi). Lekin sinovda
  // bu "[disabled]" degan tushunarsiz xatoga aylanadi, shuning uchun sababni
  // oldindan aytamiz.
  if (process.env.GENERATION_ENABLED !== "true") {
    console.error(
      'GENERATION_ENABLED "true" emas — byudjet qorovuli hamma chaqiruvni rad etadi.\n' +
        "Sinash uchun: GENERATION_ENABLED=true pnpm llm:smoke",
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL sozlanmagan — chaqiruv ishlaydi, lekin LlmCall yozilmaydi.\n" +
        "Bu sinovning asosiy maqsadi jurnalni tekshirish, shuning uchun to'xtatamiz.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Provayderlar: ${providers.map(([id]) => id).join(", ")}` +
      (providers.length === 1 ? "  (ikkinchisi sozlanmagan)" : ""),
  );

  for (const [id] of providers) {
    console.log(`\n--- ${id} ---`);

    // Faqat shu provayderni qoldiramiz — A/B taqsimoti aralashmasin.
    for (const other of ["anthropic", "gemini"] as const) {
      if (other !== id) setProvider(other, null);
    }

    const started = Date.now();
    try {
      const res = await runLlm({
        purpose: "smoke",
        tier: "cheap",
        userId: null,
        system: [
          {
            text: "Sen o'zbek maktab o'qituvchisiga yordam beruvchi assistentsan. Faqat o'zbek tilida (lotin alifbosi) javob ber.",
            cacheable: true,
          },
        ],
        messages: [{ role: "user", content: "Fizikada tezlik nima? Bir jumlada." }],
        schema: Answer,
        maxOutputTokens: 512,
        effort: "low",
      });

      console.log(`  model:    ${res.model}`);
      console.log(`  javob:    ${res.data.javob}`);
      console.log(
        `  tokenlar: ${res.usage.tokensIn} kirish / ${res.usage.tokensOut} chiqish` +
          (res.usage.cacheRead ? ` (kesh: ${res.usage.cacheRead})` : ""),
      );
      console.log(`  xarajat:  $${res.costUsd}`);
      console.log(`  vaqt:     ${Date.now() - started} ms`);
      console.log(`  LlmCall:  ${res.llmCallId ?? "YOZILMADI (!)"}`);
    } catch (e) {
      if (isLlmError(e)) {
        console.error(`  XATO [${e.kind}] ${e.message}`);
      } else {
        console.error("  XATO", e);
      }
      process.exitCode = 1;
    }
  }

  console.log("\n--- Bazadagi oxirgi 5 ta LlmCall ---");
  const rows = await prisma.llmCall.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      provider: true,
      model: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      purpose: true,
      userId: true,
    },
  });
  if (rows.length === 0) {
    console.log("  (bo'sh — jurnal yozilmagan, bu XATO)");
    process.exitCode = 1;
  }
  for (const r of rows) {
    console.log(
      `  ${r.provider.padEnd(9)} ${r.model.padEnd(24)} ` +
        `${String(r.tokensIn).padStart(6)}/${String(r.tokensOut).padStart(5)} ` +
        `$${r.costUsd.toString()}  ${r.purpose}` +
        (r.userId === null ? "  (tizim)" : ""),
    );
  }
}

void main();
