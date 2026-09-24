# 14-sessiya — Taqdimot (SLIDES)

Kontekst: generatsiya konveyeri, muharrir va interfeys tayyor.

**Qaror: Canva va Gamma ISHLATILMAYDI.** Canva Autofill har bir oxirgi
foydalanuvchidan Canva Enterprise a'zoligini talab qiladi — o'zbek
o'qituvchisi uchun imkonsiz. Gamma API ishlaydi, lekin har taqdimotga
alohida to'lov, kontent tashqariga chiqishi, internetsiz ishlamasligi va
dizayn nazoratining yo'qligi uni asosiy yo'l sifatida yaroqsiz qiladi.
**O'z shablonlarimiz quriladi.**

## Bajariladigan ish

### 1. `slide` bloki
```ts
{ id, type: "slide", layout, title, bullets: string[], notes?, imagePrompt? }
layout: "title" | "bullets" | "two-column" | "quote" | "image" | "question" | "section"
```
`lib/documents/blocks.ts` ga qo'shiladi (yangi model emas — slaydlar o'sha
hujjat bloklari ichida yashaydi).

### 2. Bosqich rejasi — `SLIDES`
1. Struktura — 8–14 slayd sarlavhasi + har biriga maqsad
2. Slaydlar mazmuni, birinchi yarmi
3. Ikkinchi yarmi + o'qituvchi uchun izohlar (`notes`)

Kurikulum konteksti o'zgarmaydi — kesh ishlaydi.

### 3. Brauzer pleyeri — **yangi paketsiz**
```
app/[locale]/ish/hujjat/[id]/taqdimot/page.tsx
components/slides/slide-player.tsx
components/slides/layouts/*.tsx        har layout uchun
```
- To'liq ekran: Fullscreen API
- Harakat: CSS `scroll-snap` + klaviatura (`←` `→` `Space` `Esc`) +
  **smart doskada barmoq bilan surish** (touch)
- Shrift `clamp()` bilan ekranga moslashadi — proyektorda ham, 75 dyuymli
  doskada ham o'qilsin
- `?rejim=notiq` — o'qituvchi ko'rinishi: joriy slayd, `notes`, keyingi slayd
- **Internetsiz ishlashi:** slaydlar server komponentida render qilinadi va
  `contentJson` sahifa bilan birga keladi. Xonada internet uzilsa ham
  taqdimot davom etsin — ishga tushgandan keyin tarmoqqa bog'liqlik bo'lmasin

Ranglar `styles/tokens.css` dan (2-qoida kuchida — o'yin istisnosi bu yerga
tegishli emas).

### 4. Chop etish / PDF — **yangi paketsiz**
`@media print` stil varag'i + "Chop etish" tugmasi (`window.print()`).
Brauzerning o'zi "PDF sifatida saqlash" beradi. Har slayd alohida sahifada,
`notes` bilan yoki `notes` siz (tanlanadigan).

Headless Chrome'ni Vercel'da yuritish bu bosqichda narx va murakkablik
jihatidan oqlanmaydi.

### 5. Kredit narxi
`cost-table.ts` ga `SLIDES` yozuvi, slayd soniga bog'liq.

### 6. Sifat tekshiruvlari
- Slayd soni so'ralganiga yaqin (±2)
- Bitta slaydda 6 tadan ortiq punkt yo'q
- Punkt uzunligi chegaradan oshmaydi (proyektorda o'qilishi kerak)
- `title` layout'i faqat birinchi slaydda
- Har slaydda sarlavha bor

### 7. i18n
`Slides` namespace, **uchala** faylda.

### 8. Testlar
- `slides-blocks` — layout union, punkt soni chegarasi
- `generation-quality` — slayd uchun yangi holatlar
- `fixtures/documents/` ga taqdimot namunasi

## Qilma
- Canva, Gamma yoki boshqa tashqi taqdimot xizmati — YO'Q
- Slayd kutubxonasi (reveal.js, Swiper va h.k.) — YO'Q
- Rasm generatsiyasi — YO'Q (`imagePrompt` maydoni kelajak uchun saqlanadi,
  hozir ishlatilmaydi)
- PPTX eksporti — YO'Q (17-sessiya)

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Taqdimot yaratiladi, 8–14 slayd chiqadi
- [ ] To'liq ekran, klaviatura va barmoq bilan surish ishlaydi
- [ ] `?rejim=notiq` da izohlar va keyingi slayd ko'rinadi
- [ ] **Internetni uzib** slayddan slaydga o'tish davom etadi
- [ ] Brauzerdan "PDF sifatida saqlash" toza chiqadi

## Ish tartibi
1. `feat/taqdimot` branch'ida ishla
2. Katta ekranda (yoki brauzer to'liq ekranda) sinab, skrinshot ko'rsat
3. PR och
