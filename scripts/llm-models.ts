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

/**
 * Tekshiruv natijasi. `skipped` va `error` ni ajratish SHART: ikkalasi ham
 * bo'sh ro'yxat beradi, lekin birinchisi "kalit qo'yilmagan", ikkinchisi
 * "kalit bor, lekin API rad etdi" — sabablari va yechimi boshqa.
 */
type Probe =
  | { status: "ok"; ids: string[] }
  | { status: "skipped"; envVar: string }
  | { status: "error"; message: string };

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

async function probe(
  envVar: string,
  fetchIds: () => Promise<string[]>,
): Promise<Probe> {
  if (!process.env[envVar]) return { status: "skipped", envVar };
  try {
    return { status: "ok", ids: await fetchIds() };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

const ids = (p: Probe): string[] => (p.status === "ok" ? p.ids : []);

async function main() {
  const [anthropicProbe, geminiProbe] = await Promise.all([
    probe("ANTHROPIC_API_KEY", anthropicModels),
    probe("GOOGLE_API_KEY", geminiModels),
  ]);

  // Kalit yo'qligi jim o'tib ketmasin: usiz butun jadval "[?]" bo'ladi va
  // skript tekshirgandek ko'rinadi. Tekshirilmagan narsa — tekshirilmagan.
  let unchecked = 0;
  for (const p of [anthropicProbe, geminiProbe]) {
    if (p.status === "skipped") {
      console.error(`${p.envVar} sozlanmagan — bu provayder TEKSHIRILMADI.`);
      unchecked++;
    } else if (p.status === "error") {
      console.error(`Ro'yxat olinmadi: ${p.message}`);
      unchecked++;
    }
  }

  const anthropic = ids(anthropicProbe);
  const gemini = ids(geminiProbe);
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
  const embedOk =
    gemini.length === 0 ? "?" : live.has(EMBEDDING_MODEL.id) ? "OK" : "YO'Q";
  console.log(
    `  [${embedOk.padEnd(4)}] gemini    ${EMBEDDING_MODEL.id}  (embedding)`,
  );

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

  if (unchecked > 0) {
    console.error(
      `\n${unchecked} ta provayder tekshirilmadi — "[?]" belgisi "to'g'ri" degani EMAS.\n` +
        "Kalitlar .env.local da ANTHROPIC_API_KEY va GOOGLE_API_KEY nomi bilan turishi kerak\n" +
        "(lib/llm/providers/ aynan shu nomlarni o'qiydi).",
    );
    process.exitCode = 1;
  }
}

void main();
