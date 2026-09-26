-- CreateEnum
CREATE TYPE "HolidayScope" AS ENUM ('GLOBAL', 'REGION');

-- DropIndex
DROP INDEX "SourceChunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Topic_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "quarter" INTEGER;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quarter" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "scope" "HolidayScope" NOT NULL DEFAULT 'GLOBAL',
    "region" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Quarter_academicYearId_number_key" ON "Quarter"("academicYearId", "number");

-- CreateIndex
CREATE INDEX "Holiday_academicYearId_idx" ON "Holiday"("academicYearId");

-- AddForeignKey
ALTER TABLE "Quarter" ADD CONSTRAINT "Quarter_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HNSW indekslarni QAYTA TIKLASH (yuqoridagi DropIndex larning javobi).
--
-- Yuqoridagi ikki `DROP INDEX` ni Prisma O'ZI qo'shdi va u HAR migratsiyada
-- qaytadi: `Topic.embedding` / `SourceChunk.embedding` —
-- `Unsupported("vector(768)")`, ularga `@@index` yozib bo'lmaydi, ya'ni HNSW
-- indekslari sxemada ko'rinmaydi va Prisma ularni "drift" deb o'chiradi.
--
-- Bu marta alohida tiklash migratsiyasi KERAK EMAS: fayl `--create-only`
-- bilan yasaldi, ya'ni hali qo'llanmagan, shuning uchun uni tahrirlash
-- `_prisma_migrations.checksum` ni buzmaydi (06-sessiyada ikki marta
-- alohida `embedding_hnsw_restore` yozishga to'g'ri kelgan edi).
--
-- Indeks yo'qolgani XATO BERMAYDI — qidiruv sekvensial skanga tushadi,
-- shuning uchun `tests/integration/embeddings-write.test.ts` ikkala indeks
-- borligini ataylab tekshiradi.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
