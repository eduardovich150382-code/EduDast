# 10-sessiya — Test generatsiyasi

Kontekst: dars ishlanma konveyeri (08) va dars jadvali (09) ishlaydi.
Bu sessiya **abstraksiyaning isboti**: ikkinchi hujjat turi o'sha konveyerda,
minimal yangi kod bilan.

## Bajariladigan ish

### 1. Bosqich rejasi — `lib/generation/plans.ts` ga `TEST`
1. Blueprint — har maqsad bo'yicha savol soni, Bloom taqsimoti, qiyinlik
2. Savollar, birinchi yarmi
3. Savollar, ikkinchi yarmi + javoblar kaliti + rubrika

Blueprint 2 va 3-bosqichga kontekst sifatida uzatiladi. Kurikulum konteksti
(08-sessiyadagi `buildTopicContext`) **o'zgarmaydi** — ya'ni dars ishlanma
yaratgan o'qituvchi test yaratsa, kontekst keshdan 10 barobar arzon o'qiladi.

### 2. Bloklar
`question`, `answerKey`, `rubric` bloklari 08-sessiyada allaqachon
aniqlangan. Yangi blok qo'shma; kerak bo'lsa mavjudini kengaytir va
migratsiya emas, `v` versiyasini saqlab qol.

### 3. Turga xos sifat tekshiruvlari — `lib/generation/quality.ts`
- Savol soni so'ralganiga teng
- Har `question` ga mos `answerKey` yozuvi bor
- `mcq`: ≥3 turli variant, aniq bitta to'g'ri, variantlar uzunligi
  bir-biriga yaqin (uzun variant — to'g'ri javob belgisi, bu yomon test)
- `truefalse`: to'g'ri/noto'g'ri nisbati 30–70 % oralig'ida
- `match`: chap va o'ng ustun soni teng, takrorlanmaydi
- Bloom taqsimoti blueprint'ga mos (±1 savol)

### 4. Kredit narxi
`lib/credits/cost-table.ts` ga `TEST` yozuvi. Savol soniga bog'liq bo'lsin.

### 5. Yaratish formasi
08-sessiyadagi formaga "tur" tanlagichi: dars ishlanma / test.
Test tanlanganda qo'shimcha maydonlar: savol soni, savol turlari, qiyinlik.

### 6. i18n
`Generator` namespace'iga yangi kalitlar, **uchala** faylda.

### 7. Testlar
- `generation-quality` — test uchun yangi holatlar: kalit yetishmaydi,
  `mcq` da ikkita to'g'ri javob, hamma javob "to'g'ri", variantlar takrorlangan
- `credits-cost-table` — `TEST` narxi, savol soniga monoton bog'liqlik
- `fixtures/documents/` ga 3 ta yangi namuna

## Qilma
- Yangi konveyer, yangi route — YO'Q. Mavjudini qayta ishlat
- O'yin, taqdimot — YO'Q
- Bloklar strukturasini buzadigan o'zgarish — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Test yaratiladi, savollar va javoblar kaliti to'g'ri
- [ ] Bir xil mavzudan dars ishlanma keyin test yaratsang, ikkinchisida
      `LlmCall` da kesh o'qish ko'rinadi (arzonroq)
- [ ] Sifatsiz test (`< 0.5`) `FAILED` bo'ladi va kredit qaytadi

## Ish tartibi
1. `feat/test-generatsiya` branch'ida ishla
2. Ikkinchi hujjat turi uchun qancha YANGI kod yozilganini aytib ber —
   agar ko'p bo'lsa, abstraksiya noto'g'ri, qayta ko'ramiz
3. PR och
