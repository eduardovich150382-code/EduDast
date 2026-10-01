// BIRINCHI import: `.env.local` ni `lib/db.ts` dan OLDIN yuklaydi.
import "./load-env";
import { assertNotProduction } from "./seed-guard";
import { DEV_TELEGRAM_ID } from "../lib/auth/dev-login";
import { schoolDay } from "../lib/calendar/placement";
import { positionForClass } from "../lib/calendar/position";
import { flattenTopicTree } from "../lib/calendar/topic-sequence";
import { prisma } from "../lib/db";

/**
 * Demo ma'lumot — 09-sessiyaning haftalik bosh sahifasini QO'LDA ma'lumot
 * kiritmasdan ko'rish uchun (`pnpm db:seed-demo`).
 *
 * Yaratadi: bitta o'qituvchi (dev bypass hisobi), ikki sinf (Fizika 7-A va
 * 7-B), to'ldirilgan dars jadvali va 7-A da bitta `DONE` `TopicProgress`.
 * 7-A haftada 3 soat, 7-B 2 soat — shuning uchun 7-A rejada OLDINDA turadi va
 * ikki sinf turli mavzuda ko'rinadi (sessiyaning qabul mezoni).
 *
 * IDEMPOTENT: hammasi `upsert`, qayta ishga tushirish dublikat yaratmaydi.
 *
 * DIQQAT — DEMO MAVZULAR. Bazada fizika 7-sinf uchun faqat 3 ta yaproq mavzu
 * bor (`fizika-7-namuna.csv`), ulardan biri esa kalendarda MAVJUD BO'LMAGAN
 * 2-chorakka bog'langan. Ya'ni reja amalda 3 darsga sig'adi va joriy hafta
 * BO'SH chiqadi — demo ko'rinmaydi. Shuning uchun skript `demo-mavzu-NN`
 * prefiksli mavzular qo'shadi.
 *
 * Bu ma'lumot BAZANI O'ZGARTIRADI, baza esa hozircha prod bilan bir xil
 * (CLAUDE.md, 7-qoida). Shuning uchun qaytarib olish yo'li bor:
 *
 *     pnpm db:seed-demo --clean
 *
 * u demo mavzularni `deletedAt` bilan o'chiradi (hard delete YO'Q), vektor
 * ustunlarini tozalaydi va demo sinflarni ham soft delete qiladi.
 *
 * QO'RIQCHI: prod belgisi bo'lsa skript ishga tushmaydi — `assertNotProduction`
 * ga qarang. `--force` bilan chetlab o'tiladi.
 */

/** Demo mavzular prefiksi — tozalash shu bo'yicha ishlaydi. */
const DEMO_SLUG_PREFIX = "demo-mavzu-";
/** Nechta demo yaproq mavzu kerak. 1-chorakda 2 soat/hafta bilan sig'adi. */
const DEMO_TOPIC_COUNT = 14;

const CLASSES = [
  /** 7-A — haftada 3 soat, dushanba/chorshanba/juma 1-dars. */
  { label: "A", lessonsPerWeek: 3, slots: [1, 3, 5].map((weekday) => ({ weekday, lessonNo: 1 })) },
  /** 7-B — haftada 2 soat, seshanba/payshanba 2-dars. */
  { label: "B", lessonsPerWeek: 2, slots: [2, 4].map((weekday) => ({ weekday, lessonNo: 2 })) },
];

const GRADE = 7;
const SUBJECT_SLUG = "fizika";
const REGION = "samarqand-shahri";

/**
 * Prod qo'riqchisi: demo ma'lumot real bazaga tushib qolmasin.
 *
 * `--force` bilan chetlab o'tiladi, lekin chetlab o'tish ATAYLAB noqulay —
 * bayroqni yozayotgan odam nima qilayotganini bilishi kerak.
 *
 * Nega `DIRECT_URL` emas, `DATABASE_URL`: `lib/db.ts` runtime'da aynan
 * shuni ishlatadi, ya'ni skript qaysi bazaga YOZISHI shundan bilinadi.
 *
 * `PROD_DATABASE_HOST` — ixtiyoriy, `.env.example` da. Beta boshlanib Neon
 * branch'larga bo'linganda prod host shu yerga yoziladi va qo'riqchi aniq
 * ishlaydi. Hozircha baza bitta (CLAUDE.md 7-qoida), shuning uchun qolgan
 * ikki signal — NODE_ENV va VERCEL_ENV — asosiy himoya.
 */
async function clean(): Promise<void> {
  const subject = await prisma.subject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true },
  });
  if (!subject) {
    console.log("Fizika fani topilmadi — tozalashga narsa yo'q.");
    return;
  }

  const demoIds = (
    await prisma.topic.findMany({
      where: { subjectId: subject.id, grade: GRADE, slug: { startsWith: DEMO_SLUG_PREFIX } },
      select: { id: true },
    })
  ).map((topic) => topic.id);

  // VEKTOR USTUNLARINI TOZALASH. `deletedAt` ning o'zi qidiruvni yopadi
  // (`findSimilarTopics` va `findStaleTopics` da `"deletedAt" IS NULL` bor),
  // lekin vektor qatorda qolib ketishining ikki zarari bor: Neon'ning 0.5GB
  // limitidan 768 x 4 bayt yeydi, va mavzu qachondir tiriltirilsa ESKIRGAN
  // vektor bilan qaytadi — `embeddedAt` turgani uchun uni hech kim qayta
  // hisoblamaydi.
  //
  // RAW SQL SHART: `embedding` — `Unsupported("vector(768)")`, Prisma Client
  // bu ustunga yoza olmaydi (`lib/curriculum/embed.ts` bilan bir xil sabab).
  const clearedVectors =
    demoIds.length > 0
      ? await prisma.$executeRaw`
          UPDATE "Topic"
          SET "embedding" = NULL, "embeddedAt" = NULL, "embeddingModel" = NULL
          WHERE "id" = ANY(${demoIds}::text[])
        `
      : 0;

  // `SourceChunk` da `deletedAt` YO'Q (sxemaga qarang), ya'ni soft delete
  // imkoni yo'q. Bu CLAUDE.md qoidasiga istisno emas: qoida foydalanuvchi
  // ma'lumoti haqida, bu esa shu skript yaratgan demo qatorlari. Odatda 0 ta
  // bo'ladi — `seed-demo` bo'lak yaratmaydi — lekin mavzu embedding quvuriga
  // tushib ulgurgan bo'lsa ular qolib ketmasin.
  const chunks =
    demoIds.length > 0
      ? await prisma.sourceChunk.deleteMany({ where: { topicId: { in: demoIds } } })
      : { count: 0 };

  // Soft delete (CLAUDE.md: hech qachon `delete`).
  const topics = await prisma.topic.updateMany({
    where: { subjectId: subject.id, grade: GRADE, slug: { startsWith: DEMO_SLUG_PREFIX } },
    data: { deletedAt: new Date() },
  });

  const user = await prisma.user.findUnique({
    where: { telegramId: DEV_TELEGRAM_ID },
    select: { id: true },
  });
  const classes = user
    ? await prisma.teachingClass.updateMany({
        where: { userId: user.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
    : { count: 0 };

  console.log(
    `Tozalandi: ${topics.count} demo mavzu (soft delete), ${clearedVectors} vektor ustuni, ` +
      `${chunks.count} manba bo'lagi, ${classes.count} sinf (soft delete).`,
  );
}

async function main(): Promise<void> {
  // `--clean` ham qo'riqchidan o'tadi: u ham YOZISH amali (soft delete).
  assertNotProduction(process.env, process.argv);

  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  const subject = await prisma.subject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true },
  });
  if (!subject) {
    throw new Error(
      `"${SUBJECT_SLUG}" fani bazada yo'q. Avval \`pnpm db:seed\` ishga tushiring.`,
    );
  }

  const [year] = await prisma.academicYear.findMany({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
    take: 1,
    select: {
      id: true,
      label: true,
      quarters: {
        orderBy: { number: "asc" },
        select: { number: true, startsOn: true, endsOn: true },
      },
      holidays: {
        where: { deletedAt: null },
        select: { startsOn: true, endsOn: true },
      },
    },
  });
  if (!year) {
    throw new Error(
      "Faol o'quv yili yo'q. /admin/kalendar da o'quv yilini yaratib, faol qilib qo'ying.",
    );
  }
  if (year.quarters.length === 0) {
    throw new Error(
      `"${year.label}" yilida chorak yo'q. /admin/kalendar da choraklarni kiriting.`,
    );
  }

  // Demo mavzular — yuqoridagi izohdagi sabab bilan.
  const existing = await prisma.topic.count({
    where: { subjectId: subject.id, grade: GRADE, deletedAt: null },
  });
  const firstQuarter = year.quarters[0]!.number;
  for (let index = 1; index <= DEMO_TOPIC_COUNT; index += 1) {
    const slug = `${DEMO_SLUG_PREFIX}${String(index).padStart(2, "0")}`;
    await prisma.topic.upsert({
      where: { subjectId_grade_slug: { subjectId: subject.id, grade: GRADE, slug } },
      // `deletedAt: null` — `--clean` dan keyin qayta ishga tushirilsa tiriltiriladi.
      update: { deletedAt: null },
      create: {
        subjectId: subject.id,
        grade: GRADE,
        slug,
        titleUz: `Demo mavzu ${index}`,
        titleUzCyrl: `Демо мавзу ${index}`,
        titleRu: `Демо-тема ${index}`,
        // `parentId` yo'q: bolasi bo'lmagan ildiz mavzu `flattenTopicTree` da
        // yaproq sifatida chiqadi.
        order: existing + index,
        quarter: firstQuarter,
        hoursPlan: 1,
        objectives: [],
        keywords: [],
      },
    });
  }

  // O'qituvchi — dev bypass hisobi, ya'ni skrinshot uchun kirish oson.
  const teacher = await prisma.user.upsert({
    where: { telegramId: DEV_TELEGRAM_ID },
    update: { subjects: [SUBJECT_SLUG], grades: [GRADE], region: REGION },
    create: {
      telegramId: DEV_TELEGRAM_ID,
      username: "dev_teacher",
      fullName: "Dev O'qituvchi",
      locale: "uz",
      subjects: [SUBJECT_SLUG],
      grades: [GRADE],
      region: REGION,
    },
    select: { id: true, region: true },
  });

  const classIds: Record<string, string> = {};
  for (const item of CLASSES) {
    const klass = await prisma.teachingClass.upsert({
      where: {
        userId_subjectId_grade_label_academicYearId: {
          userId: teacher.id,
          subjectId: subject.id,
          grade: GRADE,
          label: item.label,
          academicYearId: year.id,
        },
      },
      update: { lessonsPerWeek: item.lessonsPerWeek, deletedAt: null },
      create: {
        userId: teacher.id,
        subjectId: subject.id,
        grade: GRADE,
        label: item.label,
        lessonsPerWeek: item.lessonsPerWeek,
        academicYearId: year.id,
      },
      select: { id: true },
    });
    classIds[item.label] = klass.id;

    for (const slot of item.slots) {
      await prisma.scheduleSlot.upsert({
        where: {
          teachingClassId_weekday_lessonNo: {
            teachingClassId: klass.id,
            weekday: slot.weekday,
            lessonNo: slot.lessonNo,
          },
        },
        update: { deletedAt: null },
        create: { teachingClassId: klass.id, ...slot },
      });
    }
  }

  // 7-A ga bitta `DONE` `TopicProgress` — aynan ‹ › tugmasi yozadigan shakl:
  // joriy mavzu, `taughtOn` bugun (UTC yarim kecha — anchor shartnomasi).
  const topicRows = await prisma.topic.findMany({
    where: { subjectId: subject.id, grade: GRADE, deletedAt: null },
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: { id: true, parentId: true, order: true, slug: true, quarter: true, hoursPlan: true },
  });
  const sequenced = flattenTopicTree(topicRows);

  const today = schoolDay(new Date());
  const classA = CLASSES[0]!;
  const position = positionForClass({
    quarters: year.quarters,
    holidays: year.holidays,
    topics: sequenced,
    lessonsPerWeek: classA.lessonsPerWeek,
    weekdays: classA.slots.map((slot) => slot.weekday),
    today,
  });
  const anchorTopicId = position.currentTopicId ?? sequenced[0]?.id;

  if (anchorTopicId) {
    await prisma.topicProgress.upsert({
      where: {
        teachingClassId_topicId: {
          teachingClassId: classIds[classA.label]!,
          topicId: anchorTopicId,
        },
      },
      update: { status: "DONE", taughtOn: today },
      create: {
        teachingClassId: classIds[classA.label]!,
        topicId: anchorTopicId,
        status: "DONE",
        taughtOn: today,
      },
    });
  }

  console.log(
    [
      `Demo tayyor (${year.label}).`,
      `O'qituvchi: Dev O'qituvchi (telegramId ${DEV_TELEGRAM_ID}), ${SUBJECT_SLUG}, ${GRADE}-sinf.`,
      `Sinflar: ${CLASSES.map((item) => `${GRADE}-${item.label} (${item.lessonsPerWeek} soat/hafta)`).join(", ")}.`,
      `Mavzular: ${sequenced.length} yaproq (shundan ${DEMO_TOPIC_COUNT} tasi demo).`,
      `7-A anchor: ${anchorTopicId ?? "yo'q"}.`,
      "Tozalash: pnpm db:seed-demo --clean",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
