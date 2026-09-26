-- HNSW indekslarni YANA TIKLASH (ikkinchi marta).
--
-- NEGA YANA KERAK BO'LDI: `20260926134900_credits_hold` migratsiyasini
-- `migrate dev` yaratganda ikkala indeksni yana DROP qildi. Bu kutilgan
-- xatti-harakat va u HAR MIGRATSIYADA qaytadi:
-- `Topic.embedding` / `SourceChunk.embedding` — `Unsupported("vector(768)")`,
-- ularga `@@index` yozib BO'LMAYDI, ya'ni HNSW indekslari Prisma sxemasida
-- hech qachon ko'rinmaydi va Prisma ularni "drift" deb o'chiradi.
--
-- NEGA ALOHIDA MIGRATSIYA, NEGA `credits_hold` OXIRIGA QO'SHILMADI:
-- `credits_hold` allaqachon QO'LLANGAN. Qo'llangan migratsiya faylini
-- tahrirlash `_prisma_migrations.checksum` bilan mos kelmay qoladi va
-- keyingi `migrate dev` "migration was modified after it was applied" deb
-- yiqiladi. `20260926102914_embedding_hnsw_restore` ham aynan shu sababdan
-- alohida fayl edi.
--
-- KEYINGI SAFAR: `pnpm db:migrate` dan keyin hosil bo'lgan migration.sql ni
-- O'QI. Ichida `DROP INDEX "Topic_embedding_hnsw_idx"` yoki
-- `DROP INDEX "SourceChunk_embedding_hnsw_idx"` bo'lsa — QO'LLASHDAN OLDIN
-- shu ikki CREATE ni o'sha faylning OXIRIGA ko'chir (fayl hali
-- qo'llanmagan bo'lsa checksum muammosi yo'q). Ulgurmasang — shunga o'xshash
-- yangi tiklash migratsiyasini yoz.
--
-- Indeks yo'qolgani XATO BERMAYDI: qidiruv ishlashda davom etadi, faqat
-- to'liq sekvensial skanga tushadi. Shuning uchun
-- `tests/integration/embeddings-write.test.ts` ikkala indeks borligini
-- ataylab tekshiradi — jim sekinlashish qizil testga aylansin.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
