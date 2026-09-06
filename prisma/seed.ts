import { prisma } from "../lib/db";

/**
 * Namuna ma'lumot: 1 ta Subject ("fizika") + 3 ta Topic.
 * `upsert` orqali — skript necha marta ishlatilsa ham xato bermaydi.
 */
async function main() {
  const physics = await prisma.subject.upsert({
    where: { slug: "fizika" },
    update: {},
    create: {
      slug: "fizika",
      nameUz: "Fizika",
      nameUzCyrl: "Физика",
      nameRu: "Физика",
    },
  });

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

  console.log(`Seed tayyor: 1 subject (${physics.slug}), ${topics.length} topic.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
