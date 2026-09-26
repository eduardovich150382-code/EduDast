-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "SourceChunk" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingModel" TEXT;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
