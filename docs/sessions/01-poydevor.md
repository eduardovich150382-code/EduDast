Men "EduDast" nomli loyihaning poydevorini quryapman. Bu O'zbekiston maktab
o'qituvchilari uchun AI ish o'rni: kurikulum daraxtiga bog'langan dars ishlanma,
test va taqdimot generatori + sinfda o'ynaladigan o'yinlar.

Bu BIRINCHI sessiya. Vazifa: ishlaydigan skelet qurish. Hech qanday LLM
generatsiyasi, hech qanday to'lov, hech qanday UI feature YOZILMAYDI — faqat
poydevor. Skoupdan chiqma.

## Bajariladigan ish

### 1. Loyiha skeleti
- Next.js 15 (App Router), TypeScript strict rejimda, pnpm
- Tailwind CSS + shadcn/ui (init, lekin faqat button, card, input, select,
  dialog, toast komponentlarini qo'sh)
- ESLint + Prettier, `pnpm lint` va `pnpm typecheck` skriptlari
- vitest sozlash + bitta namuna test
- Papka tuzilishi: app/ components/ lib/ server/ prisma/ styles/ messages/

### 2. Dizayn tokenlari — styles/tokens.css
Quyidagi paletni CSS o'zgaruvchilari sifatida yoz va Tailwind konfiguratsiyasiga
ulab qo'y (tailwind.config da semantik nomlar: bg-surface, text-ink, border-line,
bg-accent va h.k.). Hech qayerda hardcode rang bo'lmasin.

  --paper:   #FBF9F4   (asosiy fon)
  --surface: #FFFFFF   (kartalar)
  --line:    #E8E2D6   (chegara)
  --ink:     #1C1917   (matn)
  --ink-2:   #6B645A   (ikkilamchi matn)
  --accent:  #C4453A   (CTA — faqat shu)
  --accent-2:#0E7C6B   (muvaffaqiyat, progress)
  --warn:    #E8A33D   (ogohlantirish, kredit)
  Tungi rejim: --paper #14120F, --ink #F5F1E8, qolganlari mos ravishda

  Radius: 10px karta, 8px tugma. Soya: 0 1px 3px rgba(28,25,23,.06).
  Neon/glow YO'Q. Ikonka: lucide-react, emoji ishlatilmaydi.

Shriftlar: sarlavha uchun Manrope, matn uchun Inter (next/font orqali).
MUHIM: o'zbek lotin alifbosida "oʻ" va "gʻ" belgilari bor — shrift ularni
to'g'ri ko'rsatishini tekshir va tokens faylida izoh qoldir.

### 3. i18n — next-intl
- Tillar: `uz` (lotin, default), `uz-Cyrl`, `ru`
- URL prefiksi: /uz, /uz-Cyrl, /ru
- messages/uz.json, messages/uz-Cyrl.json, messages/ru.json
- Til almashtirgich komponenti
- Barcha demo matn kalitlar orqali chiqsin, hardcode bo'lmasin

### 4. Prisma sxemasi — TO'LIQ v1 modeli
Quyidagi modellarni yoz. Bu sxema keyingi 12 haftaga mo'ljallangan, hozir
hammasini yoz (jadval bo'sh tursa ham) — keyin migratsiya kam bo'ladi.

  User          — id, telegramId (unique, BigInt), username, fullName,
                  role (TEACHER|ADMIN), region, subjects[], grades[],
                  locale, creditBalance, deletedAt, createdAt
  Subject       — id, slug (unique), nameUz, nameUzCyrl, nameRu
  Topic         — id, subjectId, parentId (o'z-o'ziga daraxt), grade, slug,
                  titleUz, titleUzCyrl, titleRu, order, objectives[],
                  keywords[], hoursPlan, embedding vector(768)
                  @@unique([subjectId, grade, slug])
  SourceChunk   — id, topicId, sourceRef, content (Text), embedding vector(768)
  Document      — id, userId, topicId, type (enum: LESSON_PLAN|TEST|CROSSWORD|
                  SLIDES|GUIDE), title, status (QUEUED|RUNNING|DONE|FAILED),
                  inputParams Json, contentJson Json, qualityScore,
                  qualityNotes Json, creditsUsed, createdAt, deletedAt
  Export        — id, documentId, format, url, sizeBytes, createdAt
  LlmCall       — id, documentId?, userId, model, tokensIn, tokensOut,
                  costUsd Decimal(10,6), purpose, createdAt
                  (bu jadval marjani ko'rish uchun — hech qachon o'chirilmaydi)
  CreditTx      — id, userId, delta, reason (enum: PURCHASE|GENERATION|
                  REFUND|REFERRAL|GRANT), refId, balanceAfter, createdAt
  PaymentIntent — id, userId, code (unique, 8 belgi), sku, amountSum,
                  method (enum: MANUAL_CARD|PAYME|CLICK),
                  status (enum: PENDING|PROOF_SUBMITTED|CONFIRMED|REJECTED|EXPIRED),
                  proofUrl, proofHash, confirmedById, confirmedAt, expiresAt,
                  rawPayload Json, createdAt
  Subscription  — id, userId (unique), plan, status, periodEnd, source
  LessonPlan    — id, userId, topicId, classLabel, scheduledAt, documentIds[],
                  status
  GameSession   — id, hostId, topicId, gameType, joinCode (unique),
                  questions Json, state, startedAt
  GamePlayer    — id, sessionId, nickname, userId?, score, answers Json

Barcha kerakli @@index larni qo'sh (userId+createdAt, status, topicId,
subjectId+grade, joinCode). pgvector kengaytmasini migratsiyada yoq.

Prisma seed skripti: bitta Subject ("fizika") + 3 ta namuna Topic.

### 5. Sog'liq va infratuzilma
- /api/health — DB ulanishini tekshiradi, {ok, db, version} qaytaradi
- Sentry sozlash (env bo'lmasa ishlamasin, xato bermasin)
- PostHog sozlash (xuddi shunday shartli)
- .env.example — barcha o'zgaruvchilar izoh bilan:
  DATABASE_URL, DIRECT_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME,
  TELEGRAM_ADMIN_CHAT_ID, R2_*, SENTRY_DSN, POSTHOG_KEY,
  LLM_MONTHLY_BUDGET_USD, GENERATION_ENABLED
- GitHub Actions CI: pnpm install → lint → typecheck → vitest → build

### 6. Bosh sahifa (minimal)
Bitta sahifa: logotip o'rni, sarlavha, qisqa tavsif, "Tez orada" —
lekin TO'LIQ dizayn tokenlari va i18n bilan. Bu tokenlar ishlayotganini
ko'rsatuvchi namuna bo'lsin. Mobil birinchi.

### 7. CLAUDE.md
Repo ildizida CLAUDE.md yarat. Men senga alohida matn beraman — agar bermagan
bo'lsam, yuqoridagi qoidalardan kelib chiqib yoz va menga ko'rsat.

## Qabul mezonlari (hammasi bajarilishi shart)
- [ ] `pnpm install && pnpm dev` toza ishlaydi
- [ ] `pnpm typecheck` 0 xato
- [ ] `pnpm lint` 0 xato
- [ ] `pnpm test` o'tadi
- [ ] `pnpm build` muvaffaqiyatli
- [ ] `prisma migrate dev` ishlaydi, pgvector yoqiladi
- [ ] /uz, /uz-Cyrl, /ru — uchalasi ham ochiladi va matn tarjima bo'ladi
- [ ] Kod ichida birorta hardcode rang yoki hardcode UI matni yo'q
- [ ] /api/health DB bilan ok qaytaradi

## Qilma
- LLM chaqiruvi, generatsiya mantiqi — YO'Q
- Auth implementatsiyasi — YO'Q (keyingi sessiyada)
- To'lov ekranlari — YO'Q
- Ortiqcha npm paket — YO'Q
- Dashboard, wizard, muharrir — YO'Q

## Ish tartibi
1. Avval menga qisqa reja ber (fayl tuzilishi + qadamlar), tasdiqlashimni kut
2. Keyin `feat/foundation` branch'ida ishla
3. Har katta qadamdan keyin nima qilganingni bir qatorda ayt
4. Oxirida: o'zgargan fayllar ro'yxati + men qo'lda qilishim kerak bo'lgan
   ishlar ro'yxati (Neon'da nima ochish, Vercel'ga qaysi env qo'yish)
5. PR och