# 17-sessiya — Eksport (PPTX, DOCX) va R2

Kontekst: hujjat, taqdimot va o'yinlar tayyor. Hozir `Export` jadvali va
5 ta `R2_*` muhit o'zgaruvchisi bor, lekin ishlatilmaydi.

## Bajariladigan ish

### 1. `lib/storage/r2.ts`
`@aws-sdk/client-s3` bilan S3-mos yozish va imzolangan havola olish.
(SigV4 ni qo'lda yozish bu yerda noto'g'ri almashuv — PR tavsifida sabab yoz.)

Bucket **yopiq** bo'lsin. Ommaviy havola faqat eksport fayllari uchun
(`R2_PUBLIC_URL`), shaxsiy fayllar (18-sessiyadagi cheklar) uchun
qisqa muddatli imzolangan havola.

### 2. `lib/exports/theme.ts`
`styles/tokens.css` dagi qiymatlarni TS konstantalariga ko'chiradi
(PPTX/DOCX kutubxonalari CSS o'qiy olmaydi).
**Test:** `theme.ts` dagi qiymatlar `tokens.css` bilan **aynan bir xil** —
aks holda 2-qoida chetlab o'tilgan bo'ladi.

### 3. PPTX — `lib/exports/pptx.ts`
`pptxgenjs`. `slide` bloklarini slaydlarga aylantiradi, 14-sessiyadagi
layout'larga mos. Shrift o'lchamlari va ranglar `theme.ts` dan.
Matn slayddan chiqib ketmasin (uzun punktlar uchun avtomatik kichraytirish
yoki kesish emas — ogohlantirish).

### 4. DOCX — `lib/exports/docx.ts`
`docx` paketi. Dars ishlanma va test uchun. Sarlavhalar, jadvallar,
ro'yxatlar. O'zbek apostroflari (`oʻ`, `gʻ`) to'g'ri chiqsin — bu
shriftga bog'liq, hujjatda `Times New Roman` yoki `Arial` ishlat.

Test uchun: savollar va javoblar kaliti **alohida sahifada**.

### 5. Route va `Export` yozuvi
```
app/api/export/[id]/[format]/route.ts   format: pptx | docx
```
`requireAuth()` → hujjat egasini tekshir → fayl yasa → R2 ga yoz →
`Export` qatori (`format`, `url`, `sizeBytes`) → havola qaytar.

Bir xil hujjat va format uchun mavjud `Export` bo'lsa va hujjat
o'zgarmagan bo'lsa — qayta yasama, mavjud havolani qaytar.
`export const maxDuration = 60`.

### 6. Ulashish havolasi
`Document` ga `shareToken String? @unique` (migratsiya `document_share`).
`app/ulash/[token]/page.tsx` — auth talab qilmaydi, faqat o'qish,
tahrirlash yo'q. O'qituvchi havolani yoqib/o'chira oladi.

`server/share-actions.ts`: `enableShare`, `disableShare` — auth birinchi.

### 7. UI
Hujjat sahifasida "Yuklab olish" menyusi: PPTX (faqat taqdimot uchun),
DOCX, Chop etish. Yasalayotganda holat ko'rsatkichi.

### 8. i18n
`Export`, `Share` namespace'lari, **uchala** faylda.

### 9. Testlar
- `exports-theme` — `theme.ts` va `tokens.css` mosligi
- `exports-pptx` — blok → slayd moslashuvi, matn kesilmasligi
- `exports-docx` — struktura, kalit alohida sahifada
- `share-actions` — 8-qoida: auth birinchi; begona hujjat rad etiladi;
  `shareToken` taxmin qilib bo'lmaydigan uzunlikda
- `export` route — begona hujjatga kirish rad etiladi

## Qilma
- Headless Chrome / PDF server tomonda — YO'Q (brauzer chop etishi yetarli)
- Rasm generatsiyasi — YO'Q
- Ommaviy eksport (bir vaqtda ko'p hujjat) — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] PPTX PowerPoint va Google Slides'da toza ochiladi
- [ ] DOCX Word'da ochiladi, `oʻ` va `gʻ` to'g'ri chiqadi
- [ ] Ulashish havolasi kirmagan foydalanuvchida ham ochiladi, tahrirlab bo'lmaydi
- [ ] Havolani o'chirsang sahifa 404 beradi
- [ ] Ikkinchi marta eksport qilsang fayl qayta yasalmaydi

## Ish tartibi
1. `feat/eksport` branch'ida ishla
2. R2 sozlamalarini men Vercel'ga qo'yishim uchun ro'yxat ber
3. PR och
