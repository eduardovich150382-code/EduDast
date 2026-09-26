import { config } from "dotenv";
import type { StaleTopic } from "../lib/curriculum/embed";
import { createScriptDb } from "./script-db";

// Next.js `.env.local` ni o'zi o'qiydi, tsx esa yo'q. Bu qator STATIC
// importlardan KEYIN, lekin `main()` dagi DINAMIK importlardan OLDIN
// ishlaydi — aynan shu tartib kerak (scripts/llm-smoke.ts dagi sabab):
// `lib/db.ts` modul yuklanishida `DATABASE_URL` bilan client quradi, ya'ni
// statik import qilinsa u env to'lishidan oldin yuklanib qolardi.
config({ path: ".env.local" });

/**
 * Mavzu embeddinglarini to'ldirish.
 *
 *   pnpm embed:backfill [--subject fizika] [--grade 7] [--force] [--limit N] [--dry-run]
 *
 * Bu fayl — faqat QOBIQ: argument o'qish, aylanma va progress chiqarish.
 * Bazaga yozish va eskirish sharti lib/curriculum/embed.ts da (testlanadi).
 *
 * NEGA createScriptDb(): u `DIRECT_URL` bilan ulanadi. `lib/db.ts`
 * singleton'i pooled `DATABASE_URL` uchun va Next.js runtime'iga mo'ljallangan
 * (scripts/script-db.ts dagi izohga qarang).
 */

const USAGE = `Ishlatilishi:
  pnpm embed:backfill [--subject <fan-slug>] [--grade <1-11>] [--force] [--limit N] [--dry-run]

Misol:
  pnpm embed:backfill --subject fizika --grade 7 --dry-run
  pnpm embed:backfill --subject fizika --grade 7

Bayroqlar:
  --subject   fan slug'i (berilmasa — barcha fanlar)
  --grade     sinf (berilmasa — barcha sinflar)
  --force     provenance'ga qaramay HAMMASINI qayta yozadi (pul sarflaydi)
  --limit     shu ishda yoziladigan maksimal mavzu soni
  --dry-run   hech narsa yozilmaydi, faqat qancha eskirgani ko'rsatiladi`;

class BackfillError extends Error {}

type Args = {
  subject?: string;
  grade?: number;
  force: boolean;
  limit?: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, dryRun: false };

  /** `--flag value` va `--flag=value` ikkalasini qabul qiladi. */
  function readValue(arg: string, name: string, i: number): [string, number] {
    if (arg.startsWith(`--${name}=`)) return [arg.slice(name.length + 3), i];
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new BackfillError(`--${name} uchun qiymat berilmagan.\n\n${USAGE}`);
    }
    return [next, i + 1];
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--force") {
      args.force = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--subject" || arg.startsWith("--subject=")) {
      const [value, next] = readValue(arg, "subject", i);
      args.subject = value;
      i = next;
    } else if (arg === "--grade" || arg.startsWith("--grade=")) {
      const [value, next] = readValue(arg, "grade", i);
      const grade = Number(value);
      if (!Number.isInteger(grade) || grade < 1 || grade > 11) {
        throw new BackfillError(`--grade 1..11 orasida butun son bo'lishi kerak (topildi: ${value}).`);
      }
      args.grade = grade;
      i = next;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const [value, next] = readValue(arg, "limit", i);
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new BackfillError(`--limit musbat butun son bo'lishi kerak (topildi: ${value}).`);
      }
      args.limit = limit;
      i = next;
    } else {
      throw new BackfillError(`Noma'lum argument: ${arg}\n\n${USAGE}`);
    }
  }

  return args;
}

function scopeLabel(args: Args): string {
  const parts = [args.subject ?? "barcha fanlar"];
  if (args.grade !== undefined) parts.push(`${args.grade}-sinf`);
  else parts.push("barcha sinflar");
  return parts.join(" · ");
}

function printDryRun(
  total: number,
  sample: StaleTopic[],
  embeddingText: (t: StaleTopic) => string,
): void {
  console.log("\n--dry-run: bazaga HECH NARSA yozilmadi.\n");
  console.log(`Eskirgan mavzu: ${total} ta`);
  if (total === 0) return;

  console.log(`\nBirinchi ${sample.length} ta va ularning vektor matni:`);
  for (const topic of sample) {
    // Matn ko'p qatorli — bitta qatorga siqib ko'rsatamiz, aks holda
    // ro'yxat o'qilmaydi.
    const text = embeddingText(topic).replace(/\s+/g, " ").slice(0, 100);
    console.log(`  - ${topic.titleUz}\n      ${text}...`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Kalitni OLDIN tekshiramiz: 96 ta matn yuborib 400 olishdan ko'ra,
  // darhol tushunarli xato yaxshi (scripts/llm-smoke.ts dagi preflight).
  if (!process.env.GOOGLE_API_KEY && !args.dryRun) {
    throw new BackfillError(
      "GOOGLE_API_KEY sozlanmagan. Embedding uchun aynan shu kalit ishlatiladi (.env.example).",
    );
  }

  // DINAMIK import — yuqoridagi `config()` izohiga qarang.
  const { EMBED_BATCH } = await import("../lib/llm");
  const {
    countStaleTopics,
    embedTopics,
    EMBEDDING_MODEL_ID,
    findStaleTopics,
    topicEmbeddingText,
    writeTopicVectors,
  } = await import("../lib/curriculum/embed");

  const db = createScriptDb();
  const startedAt = new Date();

  try {
    const scope = { subjectSlug: args.subject, grade: args.grade, force: args.force };
    const total = await countStaleTopics(db, scope);

    console.log(`Model: ${EMBEDDING_MODEL_ID}`);
    console.log(`Qamrov: ${scopeLabel(args)}${args.force ? " · --force" : ""}`);

    if (args.dryRun) {
      printDryRun(total, await findStaleTopics(db, { ...scope, limit: 10 }), topicEmbeddingText);
      return;
    }

    if (total === 0) {
      console.log("\nEskirgan mavzu yo'q — hech narsa yozilmadi.");
      return;
    }

    const target = args.limit === undefined ? total : Math.min(args.limit, total);
    const batches = Math.ceil(target / EMBED_BATCH);
    console.log(`Eskirgan: ${total} ta · yoziladi: ${target} ta · partiya: ${batches} ta\n`);

    let written = 0;
    let batch = 0;

    while (written < target) {
      const limit = Math.min(EMBED_BATCH, target - written);
      const topics = await findStaleTopics(db, { ...scope, limit });
      if (topics.length === 0) break;

      batch += 1;

      // TARMOQ — tranzaksiyadan TASHQARIDA (lib/curriculum/embed.ts izohi).
      const vectors = await embedTopics(topics, { userId: null, db });

      // HAR PARTIYA ALOHIDA COMMIT: o'rtada yiqilsa yozilgani qoladi.
      const count = await db.$transaction((tx) => writeTopicVectors(tx, topics, vectors));

      // CHEKSIZ AYLANMA QALQONI: `UPDATE` da `AND "deletedAt" IS NULL` bor,
      // ya'ni so'rov bilan yozuv orasida mavzu o'chirilsa hech narsa
      // yozilmaydi va AYNI partiya qayta-qayta tanlanadi — pul sarflab
      // aylanib qolardi.
      if (count === 0) {
        console.error(
          `\nOGOHLANTIRISH: [${batch}] partiyada ${topics.length} ta mavzu tanlandi, ` +
            "lekin 0 ta yozildi. Mavzular tanlanish bilan yozuv orasida " +
            "o'chirilgan bo'lishi mumkin. Aylanma to'xtatildi.",
        );
        break;
      }

      written += count;
      console.log(
        `[${batch}/${batches}] ${count} ta yozildi · jami ${written}/${target} · qoldi ${target - written}`,
      );
    }

    const spend = await db.llmCall.aggregate({
      where: { purpose: "embed-topic", createdAt: { gte: startedAt } },
      _sum: { costUsd: true, tokensIn: true },
      _count: true,
    });

    console.log(
      `\nYakun: ${written} ta vektor yozildi · ${spend._count} chaqiruv · ` +
        `${spend._sum.tokensIn ?? 0} token · $${(spend._sum.costUsd ?? 0).toString()}`,
    );
    console.log("(embedding narxi TASDIQLANMAGAN — lib/llm/models.ts izohiga qarang)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof BackfillError) {
    console.error(`\n${error.message}\n`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
