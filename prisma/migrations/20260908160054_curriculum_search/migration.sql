-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- HNSW indekslar (QO'LDA qo'shilgan).
--
-- NEGA QO'LDA: Prisma `Unsupported("vector(768)")` ustuniga @@index yoza
-- olmaydi, shuning uchun bu ikki qator har migratsiyada qayta yozilmaydi —
-- ular faqat shu faylda yashaydi. Prisma noma'lum indeks turini (hnsw)
-- drift deb hisoblamaydi.
--
-- NEGA HNSW (ivfflat emas): ivfflat indeks sifatli bo'lishi uchun jadval
-- allaqachon to'la bo'lishi kerak (u ma'lumotdan klaster o'rganadi), bizda
-- esa embeddinglar 4-sessiyada asta-sekin to'ldiriladi. HNSW bo'sh
-- jadvalda ham quriladi va qator qo'shilgani sayin o'sadi.
--
-- vector_cosine_ops — qidiruv `<=>` (cosine distance) operatorini
-- ishlatadi (lib/curriculum/search.ts). Boshqa ops klassi tanlansa indeks
-- ishlatilmay qoladi va so'rov jimgina sekvensial skanga tushadi.
CREATE INDEX "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
