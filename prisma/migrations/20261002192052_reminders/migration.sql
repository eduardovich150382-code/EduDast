-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "User_remindersEnabled_lastReminderAt_idx" ON "User"("remindersEnabled", "lastReminderAt");

-- HNSW INDEKSLARNI QAYTA TIKLASH (yuqoridagi DropIndex larning javobi).
-- Sabab 20261001192957_teaching_class_topic_offset dagi bilan bir xil:
-- `embedding` ustunlari `Unsupported("vector(768)")`, sxemada ko'rinmaydi
-- va Prisma ularni HAR migratsiyada "drift" deb o'chiradi.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
