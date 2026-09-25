import { config } from "dotenv";
import { MODELS, EMBEDDING_MODEL } from "../lib/llm/models";

/**
 * Provayderlarning O'Z API'sidan mavjud model ro'yxatini olib chiqadi va
 * reyestrimiz bilan solishtiradi.
 *
 * NEGA KERAK: model ID'lari tez almashadi va hujjat sahifasi har doim ham
 * ochilavermaydi. Bu skript haqiqatni manbadan oladi — noto'g'ri yoki
 * eskirgan ID darhol ko'rinadi.
 *
 *   pnpm llm:models
 */

config({ path: ".env.local" });

async function anthropicModels(): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const out: string[] = [];
  for await (const m of client.models.list()) out.push(m.id);
  return out;
}

async function geminiModels(): Promise<string[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return [];
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: key });
  const out: string[] = [];
  for await (const m of await client.models.list()) {
    if (m.name) out.push(m.name.replace(/^models\//, ""));
  }
  return out;
}

async function main() {
  const [anthropic, gemini] = await Promise.all([
    anthropicModels().catch((e) => {
      console.error("Anthropic ro'yxati olinmadi:", e instanceof Error ? e.message : e);
      return [] as string[];
    }),
    geminiModels().catch((e) => {
      console.error("Gemini ro'yxati olinmadi:", e instanceof Error ? e.message : e);
      return [] as string[];
    }),
  ]);

  const live = new Set([...anthropic, ...gemini]);

  console.log("\n=== Reyestrdagi modellar ===");
  let missing = 0;
  for (const entry of Object.values(MODELS)) {
    const listed = live.has(entry.id);
    const source = entry.provider === "anthropic" ? anthropic : gemini;
    const checked = source.length > 0;
    const mark = !checked ? "?" : listed ? "OK" : "YO'Q";
    if (checked && !listed) missing++;
    console.log(
      `  [${mark.padEnd(4)}] ${entry.provider.padEnd(9)} ${entry.id.padEnd(26)} ` +
        `$${entry.inputPerMTok}/$${entry.outputPerMTok}` +
        (entry.verified ? "" : "  (narx tasdiqlanmagan)"),
    );
  }
  const embedOk = gemini.length === 0 ? "?" : live.has(EMBEDDING_MODEL.id) ? "OK" : "YO'Q";
  console.log(`  [${embedOk.padEnd(4)}] gemini    ${EMBEDDING_MODEL.id}  (embedding)`);

  if (anthropic.length > 0) {
    console.log("\n=== Anthropic'da mavjud ===");
    for (const id of anthropic) console.log("  " + id);
  }
  if (gemini.length > 0) {
    console.log("\n=== Gemini'da mavjud (generateContent) ===");
    for (const id of gemini) console.log("  " + id);
  }

  if (missing > 0) {
    console.error(
      `\n${missing} ta model provayderda topilmadi — lib/llm/models.ts ni yangilang.`,
    );
    process.exitCode = 1;
  }
}

void main();
