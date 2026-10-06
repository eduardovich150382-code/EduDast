-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'GAME';

-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- HNSW INDEKSLARNI QAYTA TIKLASH (yuqoridagi DropIndex larning javobi).
-- Sabab 20261002192052_reminders dagi bilan bir xil: `embedding` ustunlari
-- `Unsupported("vector(768)")`, sxemada ko'rinmaydi va Prisma ularni HAR
-- migratsiyada "drift" deb o'chiradi. Tiklanmasa semantik qidiruv
-- (`lib/generation/retrieval.ts`) to'liq skanerlashga tushib ketardi.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
