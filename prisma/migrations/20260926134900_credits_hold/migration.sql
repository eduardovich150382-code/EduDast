-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "creditsHeldFor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failReason" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditsHeld" INTEGER NOT NULL DEFAULT 0;
