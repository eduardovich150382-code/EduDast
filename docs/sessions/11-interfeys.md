# 11-sessiya — To'liq interfeys

Kontekst: dars ishlanma va test ishlaydi, lekin interfeys hali oddiy.
Bu sessiyada mahsulot **o'qituvchi dasturchisiz to'liq foydalana oladigan**
holatga keladi.

## Bajariladigan ish

### 1. Yaratish sehrgari
`app/[locale]/ish/yarat/page.tsx` — qadamli, holat URL `searchParams` da
(orqaga tugmasi ishlashi va havolani ulashish uchun):

1. **Tur** — dars ishlanma / test (keyin taqdimot va o'yin qo'shiladi)
2. **Mavzu** — fan → sinf → chorak → mavzu. Qidiruv maydoni bilan,
   mavzular daraxti ko'rinishida. Bosh sahifadan kelingan bo'lsa
   **to'ldirilgan** holda
3. **Parametrlar** — davomiylik, savol soni, qiyinlik (turga qarab)
4. **Tasdiqlash** — kredit narxi, joriy balans, "Yaratish" tugmasi

```
components/generator/wizard.tsx
components/generator/step-type.tsx
components/generator/step-topic.tsx
components/generator/topic-picker.tsx
components/generator/step-params.tsx
components/generator/step-confirm.tsx
components/generator/generation-progress.tsx
```

### 2. Jarayon ko'rsatkichi
`generation-progress.tsx` bosqich halqasini `fetch` + `AbortController`
bilan aylantiradi. **Soxta progress bar YO'Q** — ko'rinadigan bosqich
ro'yxati: har bosqich nomi, tugagani ✓, joriysi aylanuvchi, qolgani ○.
Bosqichlar orasida kelgan bloklar darhol ekranga chiqsin.
Bosqich yiqilsa — "Qayta urinish" tugmasi (holat bazada, xavfsiz).

### 3. Hujjatlar ro'yxati
`app/[locale]/ish/hujjatlar/page.tsx` — sahifalangan, tur va holat
bo'yicha filtr, qidiruv. Har kartada: sarlavha, tur, mavzu, sana, holat,
sifat belgisi.

```
components/documents/document-card.tsx
components/documents/document-list.tsx
components/documents/status-badge.tsx
```

### 4. Xato va yuklanish ekranlari
Hozir loyihada birorta `error.tsx` yoki `loading.tsx` yo'q — har xato
Next'ning standart ekraniga tushadi. Qo'sh:
`app/[locale]/ish/error.tsx`, `app/[locale]/ish/loading.tsx`,
`app/[locale]/ish/hujjatlar/loading.tsx`, `app/[locale]/admin/error.tsx`.

### 5. Tungi rejim tugmasi
`next-themes` o'rnatilgan, lekin provider ulanmagan — shuning uchun
`components/ui/*` dagi barcha `dark:` klasslari **hozir o'lik**.
`ThemeProvider` ni `app/[locale]/layout.tsx` ga ula, header'ga tugma qo'sh
(lucide `Sun`/`Moon`). `components/ui/sonner.tsx` dagi `useTheme()` shundan
keyin to'g'ri ishlaydi.

### 6. Bosh sahifa (landing)
Hozir `/kirish` ga havola yo'q — foydalanuvchi manzilni qo'lda yozishi kerak.
Aniq CTA tugmasi qo'sh. "Tez orada" belgisini olib tashla va uchta haqiqiy
imkoniyatni yoz.

### 7. Tozalash
`components/ui/dialog.tsx` hech qayerda ishlatilmaydi — o'chir yoki
ishlatilsin. Teginish nishonlari: chiplar hozir ~36–40 px, **≥44 px** qil.
Input'lar `text-base` bo'lsin (iOS'da zoom bo'lmasligi uchun).

### 8. Yangi shadcn primitivlari
`textarea`, `badge`, `progress`, `skeleton`, `tabs`, `sheet`.
Bular npm paketi emas, repo ichidagi komponentlar — bundle qoidasiga zid emas.

### 9. Sonner toast
Hozir sonner o'rnatilgan, lekin bitta ham `toast()` chaqiruvi yo'q.
Xato va muvaffaqiyat xabarlari uchun ishlat — hozirgi umumiy
`Onboarding.genericError` o'rniga aniq xabarlar.

### 10. i18n
Barcha yangi matnlar **uchala** faylda. `tests/i18n-messages.test.ts`
avtomatik tekshiradi.

### 11. Testlar
- Mavjud `tokens-guard` va `i18n-messages` testlari yangi fayllarni
  o'zi qamrab oladi — buzilmasin
- Yangi server action bo'lsa — yangi vitest fayli (8-qoida)

## Qilma
- Hujjat muharriri — YO'Q (13-sessiya)
- Yangi hujjat turlari — YO'Q
- Yangi npm paket — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Telefonda butun oqim: kirish → bosh sahifa → tayyorlash → natija
- [ ] Uchala tilda ishlaydi
- [ ] Tungi rejim tugmasi ishlaydi, `components/ui/*` to'g'ri ko'rinadi
- [ ] Bosh sahifadan kirish tugmasi bor
- [ ] Barcha teginish nishonlari ≥44 px

## Ish tartibi
1. `feat/interfeys` branch'ida ishla
2. Telefon skrinshotlarini ko'rsat (uchala tilda, kunduzgi va tungi)
3. PR och
