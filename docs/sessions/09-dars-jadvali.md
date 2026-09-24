# 09-sessiya — Sinflar, dars jadvali va haftalik bosh sahifa

Kontekst: kalendar va taqvim-mavzu reja (07), dars ishlanma generatsiyasi
(08) tayyor. Bu sessiyada mahsulot "bo'sh sahifa so'raydigan asbob"dan
**"ertangi darsingizni o'zi biladigan yordamchi"**ga aylanadi.

## Bajariladigan ish

### 1. Migratsiya `teaching_schedule`

```
TeachingClass   id, userId, subjectId, grade, label ("A"), lessonsPerWeek,
                academicYearId, deletedAt, createdAt
                @@unique([userId, subjectId, grade, label, academicYearId])
                @@index([userId])

ScheduleSlot    id, teachingClassId, weekday (1..6), lessonNo (1..8)
                @@unique([teachingClassId, weekday, lessonNo])
                @@index([teachingClassId])

TopicProgress   id, teachingClassId, topicId, status (PLANNED|DONE|SKIPPED),
                taughtOn, createdAt
                @@unique([teachingClassId, topicId])
                @@index([teachingClassId, taughtOn])
```

Yangi enum: `TopicProgressStatus { PLANNED, DONE, SKIPPED }`.
Mavjud `LessonPlan` ishga tushadi: bitta aniq dars — `teachingClassId`,
`scheduledAt`, `topicId`, `documentIds[]`.

Har `@@index` ga sabab izohi yoz (CLAUDE.md, baza qoidalari).

### 2. Sinflar sahifasi
`app/[locale]/ish/sinflarim/page.tsx`:
- Sinf qo'shish: fan (o'qituvchining `subjects` idan) → sinf raqami →
  harf (A/B/V/G yoki bo'sh) → haftada necha soat
- Ro'yxat, tahrirlash, o'chirish (soft delete)

`server/class-actions.ts`: `saveTeachingClass`, `deleteTeachingClass` —
`requireAuth()` BIRINCHI, keyin Zod. Fan o'qituvchining `subjects` ida
borligini tekshir (onboarding'dagi `saveSubjects` namunasi).

### 3. Dars jadvali sahifasi
`app/[locale]/ish/jadval/page.tsx`:
- 6 kun × 8 dars to'ri. Katakni bosasiz → sinf tanlanadi (yoki bo'shatiladi)
- **Mobil:** bir vaqtda bitta kun, chapga-o'ngga suriladi; kompyuterda butun hafta
- Yopishqoq pastki saqlash paneli (onboarding'dagi namuna)
- Ziddiyat tekshiruvi: bitta katakka ikkita sinf qo'yib bo'lmaydi
- Ogohlantirish: sinfning `lessonsPerWeek` i jadvaldagi soniga mos kelmasa

`server/schedule-actions.ts`: `saveScheduleSlots` — butun haftani bir marta
saqlaydi (`deleteMany` + `createMany` bitta tranzaksiyada).

### 4. "Hozir qaysi mavzudamiz" — `lib/calendar/position.ts`
07-sessiyadagi `placement.ts` ni ishlatadi. Har `TeachingClass` uchun:
- `anchor` = oxirgi `TopicProgress` (`status: DONE`, eng katta `taughtOn`)
- `weekdays` = `ScheduleSlot` lardan
- `lessonsPerWeek` = sinfdan
- Natija: bugungi/ertangi mavzu, hafta bo'yicha taqsimot

**Jadval kiritilmagan bo'lsa:** `weekdays` bo'sh → `lessonsPerWeek` bo'yicha
faqat "bu hafta qaysi mavzu" hisoblanadi, kun aniqlanmaydi.

### 5. Haftalik bosh sahifa — `app/[locale]/ish/page.tsx`
Mavjud 4 ta "Tez orada" kartasi **butunlay olib tashlanadi**. O'rniga:

**Tepada:** chorak va hafta raqami, sana oralig'i, qisqa xulosa
("Bu hafta 5 ta dars, 2 tasiga material tayyor").

**Kunlar bo'yicha** (faqat dars bor kunlar):
- Dars raqami, sinf, fan
- Mavzu nomi va tartib raqami
- Tayyorlangan materiallar (dars ishlanma / test / taqdimot / o'yin) —
  bor bo'lsa havola, yo'q bo'lsa "Tayyorlash" tugmasi
- Mavzu yonida ‹ › strelkalari — bir teginishda oldinga/orqaga surish
  (`TopicProgress` ga `DONE` yoziladi)

**Jadval yo'q bo'lsa:** har sinf uchun bitta karta — "Fizika 7-A. Bu hafta
reja bo'yicha 1.6-mavzu: Tezlanish." + "Tayyorlash" tugmasi + "Dars
jadvalini kiritish" havolasi.

**Sinf ham yo'q bo'lsa:** onboarding'dagi `subjects`/`grades` dan foydalanib
xuddi shunday taklif + "Sinflaringizni qo'shing" havolasi.

"Tayyorlash" tugmasi generatsiya formasini fan/sinf/chorak/mavzu
**to'ldirilgan** holda ochadi (08-sessiyadagi forma `searchParams` qabul qilsin).

### 6. `server/progress-actions.ts`
- `markTopicTaught(teachingClassId, topicId)` — `TopicProgress` upsert, `DONE`
- `shiftClassPosition(teachingClassId, direction)` — bir mavzu oldinga/orqaga
Har ikkisi `requireAuth()` BIRINCHI, sinf o'qituvchiniki ekanini tekshir.

### 7. i18n
`Schedule`, `Classes`, `Week` namespace'lari, **uchala** faylda.

### 8. Testlar
- `calendar-position` — jadval bor/yo'q; anchor bor/yo'q; ta'til haftasi;
  sinf orqada; ikki sinf turli mavzuda
- `class-actions` — 8-qoida: auth birinchi; boshqa o'qituvchining sinfini
  tahrirlab bo'lmaydi; o'qituvchi tanlamagan fan rad etiladi
- `schedule-actions` — 8-qoida: bir katakka ikki sinf rad etiladi; saqlash
  atomar (yarim yozilmaydi)
- `progress-actions` — 8-qoida: begona sinf rad etiladi; surish chegaradan
  chiqmaydi (birinchi mavzudan orqaga, oxirgisidan oldinga)

## Qilma
- Eslatma/bildirishnoma — YO'Q (12-sessiya)
- Yangi hujjat turlari — YO'Q
- Boshqa o'qituvchilar bilan jadval almashish — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Sinf qo'shish va dars jadvali kiritish telefonda qulay ishlaydi
- [ ] Bosh sahifada hafta, kunlar va har kunning mavzusi to'g'ri chiqadi
- [ ] Mavzuni bir orqaga surganda keyingi hisoblar yangi nuqtadan ketadi
- [ ] Jadval kiritilmagan holatda ham taklif chiqadi
- [ ] 7-A va 7-B turli mavzuda tursa, ikkalasi ham to'g'ri ko'rsatiladi
- [ ] "Tayyorlash" tugmasi formani to'ldirilgan holda ochadi

## Ish tartibi
1. `feat/dars-jadvali` branch'ida ishla
2. Avval `position.ts` va testi, keyin UI
3. Migratsiyani o'zing ishlat
4. Bosh sahifaning telefondagi skrinshotini ko'rsat
5. PR och
