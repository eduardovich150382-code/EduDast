# 07-sessiya — O'quv yili kalendari va taqvim-mavzu reja

Kontekst: AI, embedding va kredit tayyor. Hozir `Topic` da chorak ma'lumoti
yo'q va o'quv yili kalendari umuman mavjud emas. Shu sessiyada mahsulotning
**eng muhim mantiqiy qismi** quriladi: "bu hafta qaysi mavzu?" degan savolga
javob beradigan hisob.

Bu sessiyada generatsiya va dars jadvali YO'Q — faqat kalendar va reja.

## Bajariladigan ish

### 1. Migratsiya `academic_calendar`

Yangi modellar:
```
AcademicYear   id, label ("2026–2027"), startsOn, endsOn, isActive
Quarter        id, academicYearId, number (1..4), startsOn, endsOn
               @@unique([academicYearId, number])
Holiday        id, academicYearId, startsOn, endsOn, label, scope
               (scope: GLOBAL | REGION — viloyat bo'yicha farq uchun)
```
`Topic` ga: `quarter Int?` (1–4).

Indekslarni sabab bilan qo'sh (`@@index([academicYearId])`), ortiqchasini emas.

### 2. CSV importiga `chorak` ustuni
`lib/curriculum/csv-schema.ts` ga yangi ixtiyoriy ustun `chorak` (1–4).
`docs/curriculum-csv.md` ni yangila, `fixtures/fizika-7-namuna.csv` ga
qiymatlarni qo'sh. Mavjud fayllar (chorak ustunisiz) baribir ishlashi kerak.

### 3. `lib/calendar/placement.ts` — MAHSULOTNING YURAGI

**Sof funksiya. Bazaga bormaydi, `new Date()` chaqirmaydi, hammasi parametr.**

```ts
type PlacementInput = {
  quarters: { number: number; startsOn: Date; endsOn: Date }[];
  holidays: { startsOn: Date; endsOn: Date }[];
  topics: { id: string; quarter: number | null; order: number; hoursPlan: number | null }[];
  lessonsPerWeek: number;
  weekdays: number[];          // dars kunlari, 1=dushanba
  anchor?: { topicId: string; taughtOn: Date };  // oxirgi "o'tildi" belgisi
};

type PlacementResult = {
  slots: { date: Date; topicId: string; lessonIndex: number }[];
  currentTopicId: (on: Date) => string | null;
};
```

Qoidalar:
- Ta'til va bayram kunlariga dars qo'yilmaydi
- `hoursPlan` bo'sh bo'lsa 1 soat deb hisoblanadi
- `quarter` bo'sh mavzular `order` bo'yicha ketma-ket taqsimlanadi
- `anchor` berilgan bo'lsa hisob o'sha nuqtadan boshlanadi (avvalgi hisob
  e'tiborsiz qoldiriladi)
- Mavzular chorak chegarasidan oshib ketsa — oshgani keyingi chorakka o'tadi,
  lekin `quarter` belgilangan mavzu o'z chorogidan oldinga siljimaydi

**Bu funksiyaga eng ko'p test yoziladi.** Kamida shu holatlar:
ta'til o'rtada; chorak qisqargan; sinf 3 mavzu orqada (`anchor`);
mavzu 3 soatlik va haftada 2 soat (ikki haftaga cho'ziladi);
`hoursPlan` bo'sh; `quarter` bo'sh; mavzular soatlari chorakka sig'maydi;
bayram dars kuniga to'g'ri kelgan; o'quv yili oxiri.

### 4. Admin — o'quv yili kalendari
`app/[locale]/admin/kalendar/page.tsx`:
- O'quv yili yaratish/tahrirlash, faol yilni belgilash
- 4 ta chorak sanalari
- Ta'til va bayramlar ro'yxati (qo'shish/o'chirish)
- Faqat o'zbek lotin (admin i18n'dan ozod)

`server/calendar-actions.ts`: `saveAcademicYear`, `saveQuarters`,
`saveHoliday`, `deleteHoliday` — har biri `requireAdmin()` BIRINCHI, keyin Zod.
Sana mantiqi tekshirilsin: choraklar kesishmasin, tartib buzilmasin,
ta'til o'quv yili ichida bo'lsin.

### 5. O'qituvchi — "Rejam" sahifasi
`app/[locale]/ish/rejam/page.tsx`:
- Fan va sinf tanlagich (o'qituvchining `subjects`/`grades` idan)
- 4 ta chorak, har birida mavzular ro'yxati tartib bilan
- Har mavzu yonida: taxminiy sana, ajratilgan soat, holati
  (o'tilgan / hozirgi / oldinda)
- Hozirgi mavzu aniq ajralib tursin
- Mobil birinchi: chorak tanlagich yuqorida, mavzular ro'yxati ostida

Hozircha `lessonsPerWeek` ni fan+sinf darajasida taxmin qil (`hoursPlan`
yig'indisi / chorak haftalari) — aniq qiymat 09-sessiyada sinf qo'shilganda keladi.

### 6. i18n
Yangi namespace: `Calendar`, `Plan`. **Uchala** faylda.

### 7. Testlar
- **`calendar-placement`** — yuqoridagi barcha holatlar. Bu sessiyaning
  asosiy testi, kamida 15 ta holat bo'lsin
- `calendar-actions` — 8-qoida: `requireAdmin` birinchi; kesishgan choraklar
  rad etiladi; ta'til yil chegarasidan tashqarida bo'lsa rad etiladi
- `curriculum-csv` — `chorak` ustuni: to'g'ri qiymat o'tadi, 0 va 5 rad etiladi,
  ustun umuman yo'q bo'lsa xato bermaydi

## Qilma
- Dars jadvali, sinflar — YO'Q (09-sessiya)
- Generatsiya — YO'Q (08-sessiya)
- `placement.ts` ichida baza so'rovi yoki `new Date()` — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Admin kalendarga 4 chorak va 2 ta'til kiritadi
- [ ] "Rejam" sahifasida fizika 7 mavzulari choraklarga to'g'ri bo'lingan
- [ ] Ta'til qo'shsang mavzular sanalari siljiydi
- [ ] Chorak ustunisiz eski CSV fayl baribir import bo'ladi

## Ish tartibi
1. `feat/kalendar` branch'ida ishla
2. **Avval `placement.ts` va uning testini yoz**, keyin UI
3. Migratsiyani o'zing ishlat
4. PR och
