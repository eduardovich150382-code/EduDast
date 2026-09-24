-- LlmCall: tizim chaqiruvlari, provayder ustuni va byudjet indeksi.
--
-- Jadval hozirgacha bo'sh (hech qanday kod unga yozmagan), shuning uchun
-- `provider` ustuni ma'lumot ko'chirishsiz qo'shiladi. Vaqtinchalik DEFAULT
-- faqat ehtiyot chorasi — sxemada default yo'q, shuning uchun darhol
-- olib tashlanadi.

-- AlterTable: userId endi ixtiyoriy (embedding backfill va cron
-- chaqiruvlari foydalanuvchisiz yoziladi).
ALTER TABLE "LlmCall" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable: qaysi provayder ishlatilgani. A/B solishtiruvi shu ustunga
-- tayanadi va bepul kvota hisobi ham shundan o'qiladi.
ALTER TABLE "LlmCall" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE "LlmCall" ALTER COLUMN "provider" DROP DEFAULT;

-- Ixtiyoriy bog'lanish uchun Prisma SET NULL kutadi (ilgari RESTRICT edi).
-- Aks holda keyingi `migrate diff` bu farqni drift deb ko'rsatadi.
ALTER TABLE "LlmCall" DROP CONSTRAINT "LlmCall_userId_fkey";
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Byudjet shifti (CLAUDE.md 5-qoida) har LLM chaqiruvidan oldin oylik va
-- kunlik SUM("costUsd") ni o'qiydi. Mavjud ([userId, createdAt]) indeksi
-- bu so'rovga yaramaydi: foydalanuvchisiz global yig'indi leftmost
-- prefiksdan foydalana olmaydi. Indekssiz so'rov jadval o'sgani sari
-- to'liq skanga aylanadi — Neon'da sekin va pullik.
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");
