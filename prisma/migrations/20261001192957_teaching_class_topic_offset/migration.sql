-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "TeachingClass" ADD COLUMN     "topicOffset" INTEGER NOT NULL DEFAULT 0;

-- HNSW INDEKSLARNI QAYTA TIKLASH (yuqoridagi DropIndex larning javobi).
-- Sabab 20261001180341_teaching_schedule dagi bilan bir xil: `embedding`
-- ustunlari `Unsupported("vector(768)")`, sxemada ko'rinmaydi va Prisma
-- ularni HAR migratsiyada "drift" deb o'chiradi.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
