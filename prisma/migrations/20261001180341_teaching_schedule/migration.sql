-- CreateEnum
CREATE TYPE "TopicProgressStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED');

-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "TeachingClass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "lessonsPerWeek" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeachingClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "teachingClassId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "lessonNo" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicProgress" (
    "id" TEXT NOT NULL,
    "teachingClassId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TopicProgressStatus" NOT NULL DEFAULT 'PLANNED',
    "taughtOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeachingClass_userId_subjectId_grade_label_academicYearId_key" ON "TeachingClass"("userId", "subjectId", "grade", "label", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlot_teachingClassId_weekday_lessonNo_key" ON "ScheduleSlot"("teachingClassId", "weekday", "lessonNo");

-- CreateIndex
CREATE INDEX "TopicProgress_teachingClassId_taughtOn_idx" ON "TopicProgress"("teachingClassId", "taughtOn");

-- CreateIndex
CREATE UNIQUE INDEX "TopicProgress_teachingClassId_topicId_key" ON "TopicProgress"("teachingClassId", "topicId");

-- AddForeignKey
ALTER TABLE "TeachingClass" ADD CONSTRAINT "TeachingClass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingClass" ADD CONSTRAINT "TeachingClass_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingClass" ADD CONSTRAINT "TeachingClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_teachingClassId_fkey" FOREIGN KEY ("teachingClassId") REFERENCES "TeachingClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_teachingClassId_fkey" FOREIGN KEY ("teachingClassId") REFERENCES "TeachingClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HNSW INDEKSLARNI QAYTA TIKLASH (yuqoridagi DropIndex larning javobi).
--
-- Prisma bu ikki DROP ni O'ZI qo'shdi va HAR migratsiyada qaytaradi:
-- `Topic.embedding` va `SourceChunk.embedding` — `Unsupported("vector(768)")`,
-- ularga `@@index` yozib bo'lmaydi, ya'ni indekslar sxemada ko'rinmaydi va
-- Prisma ularni "drift" deb o'chiradi. Fayl `--create-only` bilan yasalgani
-- uchun hali qo'llanmagan, shuning uchun uni tahrirlash
-- `_prisma_migrations.checksum` ni buzmaydi.
--
-- Indeks yo'qolgani XATO BERMAYDI — qidiruv sekvensial skanga tushadi, ya'ni
-- faqat sekinlashadi. Shuning uchun qorovul test:
-- `tests/integration/embeddings-write.test.ts` ikkalasini tekshiradi.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
