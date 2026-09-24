# 06-sessiya — Kredit tizimi

Kontekst: AI qatlami va embedding tayyor. Hozir `CreditTx`, `PaymentIntent`
jadvallari bor, lekin hech kim ularga yozmaydi. CLAUDE.md 4-qoidasi:
**kredit faqat generatsiya muvaffaqiyatli tugagach yechiladi.**

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
