-- Yetim generatsiyalarni tozalash uchun indeks (08-sessiya).
-- `lib/generation/reap.ts` har `GET /api/generate/[id]/holat` da
-- `userId + status='RUNNING' + startedAt < now - 15m` bo'yicha qidiradi.
CREATE INDEX "Document_userId_status_startedAt_idx" ON "Document"("userId", "status", "startedAt");

-- DIQQAT: Prisma bu migratsiyani yasaganda `SourceChunk_embedding_hnsw_idx`
-- va `Topic_embedding_hnsw_idx` uchun `DROP INDEX` qo'shgan edi — ular
-- QO'LDA OLIB TASHLANDI. Sabab: `embedding` ustuni `Unsupported("vector")`,
-- shuning uchun Prisma HNSW indekslarini "ortiqcha" deb biladi va har
-- migratsiyada o'chirishga urinadi. Ularsiz semantik qidiruv to'liq skanga
-- aylanadi (`lib/curriculum/search.ts`).
