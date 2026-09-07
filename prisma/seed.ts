import { DEV_TELEGRAM_ID } from "../lib/auth/dev-login";
import { prisma } from "../lib/db";

/**
 * Onboarding'da tanlash mumkin bo'lgan fanlar ro'yxati. `isActive: true` —
 * hozir kurikulum bor (fizika, matematika, ona tili); qolganlari
 * onboarding'da "tez orada" belgisi bilan ko'rinadi, lekin baribir
 * tanlash mumkin — shu orqali qaysi fan ko'p so'ralayotgani bilinadi.
 */
const SUBJECTS = [
  { slug: "fizika", nameUz: "Fizika", nameUzCyrl: "Физика", nameRu: "Физика", isActive: true },
  {
    slug: "matematika",
    nameUz: "Matematika",
    nameUzCyrl: "Математика",
    nameRu: "Математика",
    isActive: true,
  },
  {
    slug: "ona-tili",
    nameUz: "Ona tili",
    nameUzCyrl: "Она тили",
    nameRu: "Родной язык",
    isActive: true,
  },
  { slug: "kimyo", nameUz: "Kimyo", nameUzCyrl: "Кимё", nameRu: "Химия", isActive: false },
  {
    slug: "biologiya",
    nameUz: "Biologiya",
    nameUzCyrl: "Биология",
    nameRu: "Биология",
    isActive: false,
  },
  {
    slug: "adabiyot",
    nameUz: "Adabiyot",
    nameUzCyrl: "Адабиёт",
    nameRu: "Литература",
    isActive: false,
  },
  {
    slug: "ingliz-tili",
    nameUz: "Ingliz tili",
    nameUzCyrl: "Инглиз тили",
    nameRu: "Английский язык",
    isActive: false,
  },
  {
    slug: "rus-tili",
    nameUz: "Rus tili",
    nameUzCyrl: "Рус тили",
    nameRu: "Русский язык",
    isActive: false,
  },
  { slug: "tarix", nameUz: "Tarix", nameUzCyrl: "Тарих", nameRu: "История", isActive: false },
  {
    slug: "geografiya",
    nameUz: "Geografiya",
    nameUzCyrl: "География",
    nameRu: "География",
    isActive: false,
  },
  {
    slug: "informatika",
    nameUz: "Informatika",
    nameUzCyrl: "Информатика",
    nameRu: "Информатика",
    isActive: false,
  },
  {
    slug: "tarbiya",
    nameUz: "Tarbiya",
    nameUzCyrl: "Тарбия",
    nameRu: "Воспитание",
    isActive: false,
  },
] as const;

/**
 * Idempotent: hammasi `slug` bo'yicha `upsert`, skript necha marta
 * ishlatilsa ham dublikat yaratmaydi va mavjud qatorlarni yangilaydi.
 */
async function main() {
  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { slug: subject.slug },
      update: {
        nameUz: subject.nameUz,
        nameUzCyrl: subject.nameUzCyrl,
        nameRu: subject.nameRu,
        isActive: subject.isActive,
      },
      create: subject,
    });
  }

  const physics = await prisma.subject.findUniqueOrThrow({ where: { slug: "fizika" } });

  const topics = [
    {
      grade: 7,
      slug: "mexanik-harakat",
      titleUz: "Mexanik harakat",
      titleUzCyrl: "Механик ҳаракат",
      titleRu: "Механическое движение",
      order: 1,
    },
    {
      grade: 7,
      slug: "kuch-va-massa",
      titleUz: "Kuch va massa",
      titleUzCyrl: "Куч ва масса",
      titleRu: "Сила и масса",
      order: 2,
    },
    {
      grade: 8,
      slug: "issiqlik-hodisalari",
      titleUz: "Issiqlik hodisalari",
      titleUzCyrl: "Иссиқлик ҳодисалари",
      titleRu: "Тепловые явления",
      order: 1,
    },
  ];

  for (const topic of topics) {
    await prisma.topic.upsert({
      where: {
        subjectId_grade_slug: {
          subjectId: physics.id,
          grade: topic.grade,
          slug: topic.slug,
        },
      },
      update: {},
      create: {
        subjectId: physics.id,
        grade: topic.grade,
        slug: topic.slug,
        titleUz: topic.titleUz,
        titleUzCyrl: topic.titleUzCyrl,
        titleRu: topic.titleRu,
        order: topic.order,
        objectives: [],
        keywords: [],
      },
    });
  }

  // Dev bypass uchun test o'qituvchisi (docs/sessions/02-auth.md, 3-band).
  // Production bazasida bunday soxta Telegram ID kerak emas.
  // `update: {}` ATAYLAB bo'sh — qayta seed onboarding progressini
  // O'CHIRMASLIGI kerak, aks holda "qayta so'ralmaydi" mezonini
  // qo'lda tekshirib bo'lmaydi.
  if (process.env.NODE_ENV !== "production") {
    await prisma.user.upsert({
      where: { telegramId: DEV_TELEGRAM_ID },
      update: {},
      create: {
        telegramId: DEV_TELEGRAM_ID,
        username: "dev_teacher",
        fullName: "Dev O'qituvchi",
        locale: "uz",
        subjects: [],
        grades: [],
      },
    });
  }

  console.log(`Seed tayyor: ${SUBJECTS.length} subject, ${topics.length} topic (${physics.slug}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
