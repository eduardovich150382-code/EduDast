# 18-sessiya — Qo'lda karta to'lovi

Kontekst: mahsulot to'liq ishlaydi, beta o'qituvchilar grant kreditlari
bilan foydalanmoqda. Endi pul olish vaqti.

Payme/Click keyinroq, xuddi shu `PaymentIntent` jadvali ustiga qo'shiladi.

## Bajariladigan ish

### 1. `lib/payments/skus.ts`
Muzlatilgan SKU jadvali: kod, kredit soni, so'mdagi summa, nomi (3 tilda).
Masalan: 50 kredit / 100 kredit / 250 kredit. Kreditga narx katta
paketda arzonroq bo'lsin.

### 2. `lib/payments/code.ts`
8 belgili Crockford base32 kod (`I`, `L`, `O`, `U` yo'q — chalkashmaslik
uchun). Unique constraint buzilsa 5 martagacha qayta urin.

### 3. Intent yaratish
`server/payment-actions.ts`:
- `createPaymentIntent` — `requireAuth()` BIRINCHI, keyin Zod (`sku`
  muzlatilgan jadvalda bo'lishi shart) → noyob kod → `PaymentIntent.create
  ({ method: MANUAL_CARD, status: PENDING, amountSum, expiresAt: +24 soat })`
- `cancelPaymentIntent`

### 4. Ko'rsatma sahifasi
`app/[locale]/ish/kredit/[code]/page.tsx`:
- Karta raqami va egasi **`.env` dan** (`MANUAL_CARD_NUMBER`,
  `MANUAL_CARD_HOLDER` — 9-qoida, kodga yozma)
- Aniq summa
- **"To'lov izohiga shu kodni yozing: A7K2M9QX"** — kattaroq shriftda,
  nusxalash tugmasi bilan. Bu kod adminga chekni uch soniyada
  moslashtirish imkonini beradi
- Chek rasmini yuklash maydoni (telefonda kamera bilan)
- Muddat hisoblagichi

### 5. Chek yuklash
`app/api/payments/[code]/isbot/route.ts` — **presigned URL emas, route
handler**, chunki baytlarni server tomonda hash qilish shart:
1. `requireAuth()`
2. Intent egasi va `PENDING` holatini tekshir
3. Rasm bo'lmagan content-type va 5 MB dan katta hajm — rad et
4. `sha256(buffer)`
5. **Avval R2 ga yoz, keyin bazaga** — DB yiqilsa yetim obyektni cron
   tozalaydi (yetim obyekt bepul, yo'qolgan chek ishonchga tushadi)
6. `updateMany({ where:{ code, userId, status:"PENDING" },
   data:{ proofUrl, proofHash, status:"PROOF_SUBMITTED" } })`
7. `proofHash` unique buzilsa → "bu chek allaqachon ishlatilgan"
   (sxemadagi izoh aynan shu uchun yozilgan)

**Chek rasmlari shaxsiy ma'lumot:** yopiq bucket, admin sahifasida qisqa
muddatli imzolangan havola. `R2_PUBLIC_URL` cheklar uchun ISHLATILMAYDI.

### 6. Telegram xabari
`lib/telegram/api.ts` ga `sendPhoto(chatId, url, caption)` qo'sh.
`TELEGRAM_ADMIN_CHAT_ID` ga: kod, o'qituvchi ismi, SKU, summa,
admin sahifasiga havola.

### 7. Admin navbati
`app/[locale]/admin/tolovlar/page.tsx` — `PROOF_SUBMITTED` intentlar,
eng eskisi tepada, yoshi belgisi bilan. Har qatorda chek rasmi va
"Tasdiqlash" / "Rad etish" tugmalari.

`server/payment-admin-actions.ts`:
- `confirmPayment` — **`requireAdmin()` BIRINCHI** (layout server action
  POST'ini himoya qilmaydi — `server/admin-actions.ts` dagi izohni
  takrorla), keyin Zod, keyin bitta tranzaksiya:
  1. `updateMany({ where:{ id, status:"PROOF_SUBMITTED" },
     data:{ status:"CONFIRMED", confirmedById, confirmedAt } })` →
     `count === 1` yoki bekor. Ikki admin bir vaqtda bossa xavfsiz
  2. `credits.purchase(tx, userId, credits, intentId)`
  3. `after()` da o'qituvchiga uning `locale` sida Telegram xabari
- `rejectPayment` — sabab bilan, `rawPayload` ga yoziladi, xabar yuboriladi,
  kredit qimirlamaydi

### 8. Cron
`app/api/cron/expire-payments/route.ts` — muddati o'tgan `PENDING` larni
`EXPIRED` qiladi. **`PROOF_SUBMITTED` hech qachon avtomatik yopilmaydi** —
qarorni odam qabul qiladi.

Kunlik xulosa: 6 soatdan ortiq kutayotgan `PROOF_SUBMITTED` bo'lsa adminga
xabar.

### 9. Kredit sahifasi
`app/[locale]/ish/kredit/page.tsx` — SKU kartalari, joriy balans,
`CreditTx` tarixi.

### 10. i18n
`Payments` namespace, **uchala** faylda.

### 11. Testlar
- `payment-code` — alifboda `I/L/O/U` yo'q, uzunlik 8, to'qnashuvda qayta urinish
- `payment-skus` — har SKU'da musbat kredit va summa, kodlar takrorlanmaydi
- `payment-actions` — 8-qoida: auth birinchi, noma'lum SKU rad etiladi
- `payment-admin-actions` — 8-qoida: **`requireAdmin` birinchi** (mavjud
  `tests/admin-actions.test.ts` dagi `it.each` namunasi); tasdiqlash aniq
  bitta `CreditTx` yozadi; ikkinchi tasdiqlash hech narsa yozmaydi;
  rad etish kredit qimirlatmaydi
- `payment-upload` — content-type va hajm rad etilishi, hash, takroriy chek
- `tests/integration/payment-confirm-race.test.ts` — ikki parallel
  tasdiqlash → bitta `CreditTx`

## Qilma
- Payme/Click integratsiyasi — YO'Q (keyingi bosqich)
- Avtomatik chek tanish (OCR) — YO'Q
- Obuna (`Subscription`) — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Telefondan chek rasmi yuklanadi
- [ ] Adminga rasm bilan Telegram xabari keladi
- [ ] Admin tasdiqlaydi → balans oshadi, o'qituvchiga xabar boradi
- [ ] **O'sha rasmni qayta yuklasang rad etiladi** (`proofHash`)
- [ ] Ikki marta tasdiqlash urinishi ikkinchi `CreditTx` yozmaydi
- [ ] Chek rasmi ommaviy havolada ochilmaydi

## Ish tartibi
1. `feat/tolov` branch'ida ishla
2. Karta ma'lumotlarini men Vercel env'ga qo'yaman — kodga yozma
3. To'liq oqimni bir marta o'zing sinab, skrinshot ko'rsat
4. PR och
