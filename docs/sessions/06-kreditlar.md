# 06-sessiya — Kredit tizimi

Kontekst: AI qatlami va embedding tayyor. Hozir `CreditTx`, `PaymentIntent`
jadvallari bor, lekin hech kim ularga yozmaydi. CLAUDE.md 4-qoidasi:
**kredit faqat generatsiya muvaffaqiyatli tugagach yechiladi.**

## Bugungi holat (2026-09-26, 05-sessiya yakunlangach)

Bu bo'lim topshiriq yozilgandan KEYIN ma'lum bo'lgan narsalar. Ishni
boshlashdan oldin o'qing — pastdagi ba'zi bandlar shu sababli o'zgaradi.

- **HNSW INDEKS TUZOG'I — `credits_hold` migratsiyasidan keyin TEKSHIR.**
  `prisma migrate dev` Prisma sxemada ko'rmagan indeksni har safar jimgina
  DROP qiladi. `Topic.embedding` / `SourceChunk.embedding` —
  `Unsupported("vector(768)")`, ularga `@@index` yozib BO'LMAYDI, ya'ni
  HNSW indekslari sxemada hech qachon ko'rinmaydi. 05-sessiyada
  `embedding_provenance` migratsiyasi ikkalasini o'chirib yuborgan va buni
  hech kim sezmagan: indeks yo'qolgani XATO BERMAYDI, qidiruv shunchaki
  to'liq skanga tushadi. Tiklash migratsiyasi
  (`20260926102914_embedding_hnsw_restore`) yozilgan, lekin tuzoq har
  migratsiyada qaytadi. Migratsiyadan keyin:
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE tablename IN ('Topic','SourceChunk') AND indexname LIKE '%hnsw%';
  ```
  Ikki qator qaytmasa — tiklash migratsiyasini qayta yoz.
  `tests/integration/embeddings-write.test.ts` da indeks tekshiruvi bor,
  ya'ni `TEST_DATABASE_URL` bilan `pnpm test` buni ushlaydi.

- **IKKI SOAT — vaqt taqqoslaydigan har qanday mantiqda.** `@updatedAt` ni
  Prisma KLIENT tomonda hisoblaydi (ishlab chiquvchi mashinasining soati),
  raw SQL dagi `NOW()` esa Neon serveridan keladi. Ikkalasini bevosita
  solishtirish beqaror (flaky) test va prodda cheksiz qayta ishlov beradi.
  05-sessiyada bu aynan shunday yuz berdi; yechim — yozuvda
  `GREATEST(NOW(), "updatedAt")`. Kreditlarda `Document.startedAt` bilan
  shunga o'xshash taqqoslash paydo bo'lsa, ikkala tomon BITTA manbadan
  bo'lsin (ikkalasi ham `NOW()`, yoki ikkalasi ham Prisma'dan).

- **TRANZAKSIYA ICHIDA TARMOQ CHAQIRUVI YO'Q.** Prisma interaktiv
  tranzaksiyasi sukut bo'yicha 5 s da uziladi (`P2028`) va `lib/db.ts` da
  `transactionOptions` yo'q — pastdagi `{timeout: 10_000}` aynan shuning
  uchun. Bundan ham muhimi: tranzaksiya ichida yozilgan jurnal qatori
  rollback bilan o'chadi, ya'ni yiqilish sababi yo'qoladi. Bu qoida
  `lib/curriculum/embed.ts` dagi `embedTopics` / `writeTopicVectors`
  ajratilishida izoh bilan yozilgan — o'sha naqshni takrorla.

- **`writeLlmCall(rec, db?)`** — ikkinchi parametr qo'shildi. Skript yoki
  cron `createScriptDb()` bilan ishlaganda o'sha ulanishni uzatadi.
  `lib/curriculum/search.ts` dagi `db?: Db` naqshining o'zi.

- **Vitest `.env.local` ni O'ZI O'QIMAYDI.** Setup fayli orqali `dotenv`
  bilan yuklanadi (`prisma.config.ts` dagi sabab). `TEST_DATABASE_URL` endi
  har terminalda ishlaydi, ya'ni pastdagi `credits-race` integratsiya testi
  skip bo'lmasligi KERAK — uni skip holida qoldirib PR ochma.

- **Neon test branch** `production` dan ochiladi va ota-baza bilan
  avtomatik yangilanmaydi. `credits_hold` migratsiyasidan keyin branch'ga
  ham qo'llash kerak:
  `DIRECT_URL="<branch direct URL>" pnpm prisma migrate deploy`
  (`migrate dev` EMAS). Yoki branch'ni o'chirib qaytadan oching.

- **`CHARS_PER_TOKEN = 2.75`** (avval 3.2 edi). O'zbekcha fizika matnida
  `countTokens` bilan o'lchangan: 165 belgi = 60 token. Byudjet shifti endi
  xarajatni kam baholamaydi. Narx jadvali uchun `getPricing()` bor
  (`getModel()` dan ajratilgan — embedding modeli `MODELS` ichida emas).

- **`gemini-embedding-001` narxi TASDIQLANMAGAN** ($0.15/Mtok, "File
  Search" stavkasidan olingan). `LlmCall.costUsd` embedding qatorlari uchun
  taxminiy — byudjet hisobida shuni yodda tut.

- **Model ro'yxatda turishi uni ishlatib bo'ladi degani EMAS.** Model
  almashtirsang `pnpm llm:models` yetarli emas, `pnpm llm:smoke` SHART.

## Bajariladigan ish

### 1. Migratsiya `credits_hold`
- `User.creditsHeld Int @default(0)` — band qilingan kreditlar
- `Document.startedAt DateTime?`
- `Document.failReason String?`

Mavjud balans = `creditBalance - creditsHeld`. **Yangi jadval yaratma.**
Shunda `CreditTx` ga faqat pul haqiqatan qimirlaganda yozuv tushadi —
4-qoida tom ma'noda bajariladi.

### 2. `lib/credits/cost-table.ts`
Sof funksiya: `DocumentType` + parametrlar → kredit narxi.
Nol narxli yo'l bo'lmasin. Savol soni oshsa narx ham oshsin (monoton).

### 3. `lib/credits/ledger.ts`

**hold(userId, amount, refId)** — o'qib-keyin-yozish EMAS, bitta operator:
```sql
UPDATE "User" SET "creditsHeld" = "creditsHeld" + $amount
WHERE id = $userId AND "deletedAt" IS NULL
  AND "creditBalance" - "creditsHeld" >= $amount
```
Prisma `where` da ustunni ustunga solishtira olmaydi → `$executeRaw`
(`lib/curriculum/search.ts` dagi konvensiya). `rowsAffected === 0` →
`InsufficientCredits`. **`deletedAt IS NULL` ni qo'lda yozishni unutma.**

**charge(userId, amount, documentId)** — bitta `$transaction`:
1. `creditsHeld` va `creditBalance` ni birga kamaytir, `RETURNING "creditBalance"`.
   0 qator → `HoldMismatch` (hold yo'q, ikki marta yechma)
2. `CreditTx.create({ delta: -amount, reason: GENERATION, refId: documentId, balanceAfter })`
   — `balanceAfter` tranzaksiya ichidagi RETURNING dan olinsin, oldingi o'qishdan EMAS
3. `Document.updateMany({ where:{id, status:"RUNNING"}, data:{status:"DONE", creditsUsed} })`
   — `count === 1` idempotentlik darvozasi, 0 bo'lsa throw va rollback

**Charge va DONE bitta tranzaksiyada bo'lishi SHART** — bu juftlik ikki marta
yechishni struktura darajasida imkonsiz qiladi.

**release(userId, amount, documentId)** — `creditsHeld` kamayadi (`>= amount`
sharti bilan) + `Document` → `FAILED` + `failReason`, bitta tranzaksiyada.
**`CreditTx` YOZILMAYDI** (hech narsa qimirlamadi).

**grant / purchase** — `creditBalance` oshadi + `CreditTx(delta>0, GRANT|PURCHASE,
refId, balanceAfter)`, bitta tranzaksiyada.

Har kredit tranzaksiyasi ~2 soniyadan kam bo'lsin, `{timeout: 10_000}` bilan.
**LLM chaqiruvini kredit tranzaksiyasi ichiga o'rama.**

### 4. `server/credit-actions.ts`
- `grantCredits` — `requireAdmin()` BIRINCHI, keyin Zod. (Layout server action
  POST'ini himoya qilmaydi — `server/admin-actions.ts` dagi izohni takrorla.)

### 5. UI
- `components/credits/balance-chip.tsx` — `app/[locale]/ish/layout.tsx`
  header'iga balans ko'rsatkichi
- `app/[locale]/admin/foydalanuvchilar/page.tsx` — o'qituvchilar ro'yxati,
  har qatorda "Kredit berish" tugmasi va joriy balans
- i18n: `Credits` namespace, **uchala** faylda

### 6. Testlar
- `credits-cost-table` — har tur bo'yicha narx, monotonlik, nol narx yo'qligi
- `credits-ledger` (mock prisma):
  - yetarsiz balansda hold rad etiladi
  - charge aniq bitta `CreditTx` yozadi, `balanceAfter` to'g'ri
  - bo'shatilgan hold ustidan charge throw qiladi va hech narsa yozmaydi
  - release `CreditTx` yozmaydi
  - `DONE` hujjat ustidan charge ishlamaydi
- `credit-actions` — 8-qoida: `requireAdmin` Zod'dan oldin ishlaydi
- `tests/integration/credits-race.test.ts` — Neon test branch,
  `TEST_DATABASE_URL` yo'q bo'lsa skip: balans 7 ga 20 ta parallel `hold(1)`
  → aniq 7 tasi o'tadi, `creditsHeld === 7`

## Qilma
- To'lov ekranlari, Payme/Click — YO'Q (18-sessiya)
- Generatsiya — YO'Q (08-sessiya)
- Manfiy `CreditTx` bilan hold qilish — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Admin panelidan kredit berish ishlaydi, `CreditTx` va `balanceAfter` to'g'ri
- [ ] Balans header'da ko'rinadi, uchala tilda
- [ ] Parallel hold testi o'tadi (`TEST_DATABASE_URL` bilan)

## Ish tartibi
1. `feat/kreditlar` branch'ida ishla
2. Migratsiyani o'zing ishlat
3. PR och
