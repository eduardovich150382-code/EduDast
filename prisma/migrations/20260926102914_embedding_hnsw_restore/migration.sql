-- HNSW indekslarni TIKLASH.
--
-- NEGA KERAK BO'LDI: oldingi migratsiya (`embedding_provenance`) ularni
-- jimgina DROP qildi. `20260908160054_curriculum_search` faylidagi izoh
-- "Prisma noma'lum indeks turini (hnsw) drift deb hisoblamaydi" deb
-- yozilgan edi — BU XATO. Prisma sxemada ko'rinmagan indeksni har
-- `migrate dev` da o'chiradi, `Unsupported("vector(768)")` ustuniga esa
-- @@index yozib bo'lmaydi. Ya'ni bu tuzoq HAR MIGRATSIYADA qaytadi.
--
-- QOIDA: `pnpm db:migrate` dan keyin hosil bo'lgan migration.sql ni O'QING.
-- Ichida `DROP INDEX "Topic_embedding_hnsw_idx"` yoki
-- `DROP INDEX "SourceChunk_embedding_hnsw_idx"` bo'lsa — shu fayldagi ikki
-- CREATE ni migratsiyaning OXIRIGA ko'chirib qo'ying.
--
-- Indeks yo'qolgani xato bermaydi: qidiruv ishlashda davom etadi, faqat
-- to'liq sekvensial skanga tushadi. Shuning uchun
-- `tests/integration/embeddings-write.test.ts` ikkala indeks borligini
-- ataylab tekshiradi — jim sekinlashish qizil testga aylansin.
--
-- `IF NOT EXISTS` — bu migratsiya toza bazada (`migrate reset`) ham
-- ishlashi uchun: o'sha yerda indekslar oldingi migratsiyadan qolgan
-- bo'lishi mumkin emas, lekin qo'lda tiklangan bazada bo'lishi mumkin.
CREATE INDEX IF NOT EXISTS "Topic_embedding_hnsw_idx" ON "Topic"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw_idx" ON "SourceChunk"
  USING hnsw ("embedding" vector_cosine_ops);
