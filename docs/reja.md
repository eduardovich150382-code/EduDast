# EduDast — to'liq tahlil va rivojlantirish rejasi

> Bu reja ikki qavatli yozilgan. Har bo'limda avval **"Siz nima ko'rasiz"** —
> o'qituvchi ekranda nimani ko'radi. Keyin **"Orqa tomonda"** — dasturchi
> (yoki vibe coding) uchun texnik tafsilot. Birinchi qismni o'qib chiqsangiz
> mahsulotni to'liq tasavvur qilasiz; ikkinchisi kod yozish paytida kerak.

---

## 1. Hozir nima bor, nima yo'q

EduDast — O'zbekiston maktab o'qituvchisi uchun AI ish o'rni. Bugungi holat:
**poydevor juda yaxshi qurilgan, lekin mahsulotning o'zi hali yo'q.**

4 ta tugallangan bosqich, ~4 700 qator kod.

**Ishlaydi:**
- Telegram orqali kirish (telefon raqami va SMS kerak emas)
- Ro'yxatdan o'tish: fan, sinf, viloyat tanlash
- Kurikulum mavzularini Excel/CSV fayldan yuklash va admin panelidan tahrirlash
- Uch til: o'zbek lotin, o'zbek kirill, rus — hammasi to'liq tarjima qilingan
- Dizayn tizimi va avtomatik tekshiruvlar (noto'g'ri rang ishlatilsa kod
  qabul qilinmaydi)

**Yo'q — umuman yozilmagan:**
- **Sun'iy intellektga ulanish** — birorta AI xizmati ulanmagan
- **Generatsiya** — dars ishlanma, test, taqdimot, o'yin: hech biri yo'q
- **Kredit tizimi** va **to'lov**
- **Mavzularni qidirish uchun "aqlli indeks"** — jadval bor, ichi bo'sh
- **Taqvim-mavzu reja, chorak, dars jadvali** — umuman yo'q
- Asosiy sahifada 4 ta bosilmaydigan "Tez orada" kartasi turibdi

**Maqsad:** o'qituvchi uchun maktabda eng yaqin yordamchi bo'ladigan,
og'ir ishni yengillashtiradigan platforma qurish.

---

## 2. Canva va Gamma — tekshirildi

Savolingizga aniq javob:

**Canva — imkonsiz.** Canva'ning avtomatik dizayn API'si (Autofill) ishlashi
uchun *ham dasturchi, ham har bir oxirgi foydalanuvchi* Canva Enterprise
obunasida bo'lishi shart. Ya'ni har bir o'zbek o'qituvchisi Canva'ning
korporativ tarifini sotib olishi kerak bo'lardi. Amalda mumkin emas.

**Gamma — ishlaydi, lekin noto'g'ri tanlov.** Gamma'ning API'si haqiqatan
bor va ishlaydi. Lekin:
- Har taqdimotga AI xarajati **ustiga** Gamma'ga alohida to'lov
- Sizning kontentingiz tashqi xizmatga chiqib ketadi
- Internetsiz ishlamaydi (sinf xonasida internet uzilsa — taqdimot yo'q)
- EduDast ichida tahrirlab bo'lmaydi
- O'zbek tilidagi sifat noma'lum va siz uni nazorat qila olmaysiz

**To'g'ri yechim — o'z shablonlarimiz.** 5–6 ta chiroyli slayd shablonini bir
marta ishlab chiqamiz. Keyin har taqdimot o'sha shablonlarda, bepul,
internetsiz, EduDast ichida tahrirlanadigan bo'lib chiqadi. Kim
PowerPoint'da ochmoqchi bo'lsa — PPTX fayl sifatida yuklab oladi.
Shablonni bir marta yaxshi qilish har safar tashqi xizmatga pul to'lashdan
ham arzon, ham sifatliroq.

Manbalar: [Canva Autofill](https://www.canva.dev/docs/connect/autofill-guide/),
[Gamma API](https://developers.gamma.app/docs/getting-started)

---

## 3. Mahsulotning yuragi: taqvim-mavzu reja va dars jadvali

Bu — butun platformaning markazi. Boshqa hamma narsa shunga ulanadi.

### 3.1. Siz nima ko'rasiz

**Birinchi kirishda** (bir martalik, ~2 daqiqa):
- Qaysi fanlardan dars berasiz? (allaqachon bor)
- Qaysi sinflarga? Masalan: 7-A, 7-B, 8-A — har birini alohida qo'shasiz
- Har sinfga haftada necha soat? (masalan fizika 7-sinf — haftada 2 soat)
- Dars jadvalingiz: "Dushanba, 3-dars — 7-A fizika", "Chorshanba, 1-dars —
  7-A fizika" va hokazo. Bosib qo'yish orqali, yozish shart emas.

**Har kuni asosiy sahifada** siz shuni ko'rasiz:

```
┌─────────────────────────────────────────────┐
│  Bu hafta · 2-chorak, 5-hafta               │
│  15–20-dekabr                               │
├─────────────────────────────────────────────┤
│  DUSHANBA 15-dek                            │
│   3-dars  7-A fizika                        │
│           1.5-mavzu · Tezlik                │
│           ✓ Dars ishlanma tayyor            │
│           + Test    + Taqdimot    + O'yin   │
│                                             │
│   5-dars  8-A fizika                        │
│           2.3-mavzu · Bosim                 │
│           ⚠ Hali hech narsa tayyor emas     │
│           [ Tayyorlash ]                    │
├─────────────────────────────────────────────┤
│  CHORSHANBA 17-dek                          │
│   1-dars  7-A fizika                        │
│           1.6-mavzu · Tezlanish             │
│           ⚠ Hali hech narsa tayyor emas     │
│           [ Tayyorlash ]                    │
└─────────────────────────────────────────────┘
```

Ya'ni: **siz "nima yaratmoqchisiz?" degan bo'sh sahifani ko'rmaysiz.**
Tizim o'zi biladi — ertaga 7-A da fizika darsingiz bor, mavzu "Tezlanish",
va hali hech narsa tayyorlanmagan. Bitta tugma bosasiz.

**Mavzuni tizim qayerdan biladi?** Chorak boshlanish sanasi, har mavzuga
ajratilgan soat va sizning haftalik soatingizdan hisoblaydi. Agar sinfingiz
orqada qolgan bo'lsa (bayram, karantin, olimpiada) — mavzu yonidagi
strelkani bosib bir mavzu orqaga surasiz, tamom. Tizim keyingi hisoblarni
o'sha yangi nuqtadan davom ettiradi.

**Dars jadvalini kiritmasangiz ham ishlaydi.** U holda sahifada shunday
turadi: "Siz fizika 7-sinfga dars berasiz. Bu hafta reja bo'yicha
1.6-mavzu — Tezlanish. Shu mavzudan tayyorlaymizmi?" Jadval kiritish —
tavsiya, majburiyat emas.

**Alohida sahifada — taqvim-mavzu rejangiz:** 4 ta chorak, har chorakda
mavzular ro'yxati, qaysilari o'tilgan (yashil), qaysi biri hozirgi (belgili),
qaysilari oldinda. Har mavzuning yonida u uchun tayyorlangan materiallar
ko'rinadi.

**Material yaratayotganda** siz avval fanni, sinfni, chorakni va mavzuni
tanlaysiz — yoki asosiy sahifadagi "Tayyorlash" tugmasini bossangiz,
uchalasi **avtomatik to'ldirilgan** holda keladi.

### 3.2. Orqa tomonda

**Yangi jadvallar (Prisma modellari):**

| Model | Nima saqlaydi |
|---|---|
| `AcademicYear` | O'quv yili: nomi ("2026–2027"), boshlanish va tugash sanasi |
| `Quarter` | Chorak: raqami (1–4), boshlanish/tugash sanasi |
| `Holiday` | Ta'til va bayramlar: sana oralig'i, nomi |
| `TeachingClass` | O'qituvchining sinfi: `userId`, `subjectId`, `grade`, `label` ("A"), `lessonsPerWeek` |
| `ScheduleSlot` | Dars jadvali katagi: `teachingClassId`, `weekday` (1–6), `lessonNo` |
| `TopicProgress` | Sinf qayerda: `teachingClassId`, `topicId`, `status` (PLANNED/DONE/SKIPPED), `taughtOn` |

`Topic` jadvaliga bitta yangi ustun: `quarter Int?` (1–4).
CSV importiga bitta yangi ustun: `chorak`.
Mavjud `LessonPlan` modeli ishga tushadi: u bitta aniq darsni bildiradi —
sana + sinf + mavzu + o'sha darsga tayyorlangan hujjatlar ro'yxati.

**Hafta-mavzu hisobi** — `lib/calendar/placement.ts`, sof funksiya:

```
kirish:  chorak sanalari, ta'tillar, mavzular ro'yxati (chorak + hours_plan),
         sinfning haftalik soati, sinfning oxirgi "o'tildi" belgisi
chiqish: har mavzu qaysi sana(lar)ga tushishi + "bugun qaysi mavzudamiz"
```

Bu funksiya **bazaga bormaydi va sanani o'zi o'qimaydi** — hammasi parametr
sifatida kiradi. Shuning uchun uni testda o'nlab holat bilan sinash mumkin:
ta'til o'rtada, chorak qisqargan, sinf 3 mavzu orqada, mavzu ikki haftaga
cho'zilgan va hokazo. Buni to'g'ri qilish butun mahsulotning to'g'riligini
belgilaydi, shuning uchun **eng ko'p test shu yerga yoziladi**.

**"O'tildi" belgisi** `TopicProgress` ga yoziladi. Avtomatik hisob har doim
ishlaydi, lekin agar sinfda qo'lda belgilangan oxirgi `DONE` bo'lsa, hisob
o'sha nuqtadan boshlanadi. Ya'ni: hech narsa qilmasangiz — avtomatik;
bir marta tuzatsangiz — tizim eslab qoladi.

**Yangi sahifalar:**
```
app/[locale]/ish/page.tsx              haftalik ko'rinish (asosiy sahifa)
app/[locale]/ish/jadval/page.tsx       dars jadvalini kiritish
app/[locale]/ish/sinflarim/page.tsx    sinflar ro'yxati
app/[locale]/ish/rejam/page.tsx        taqvim-mavzu reja, chorak bo'yicha
app/[locale]/admin/kalendar/page.tsx   o'quv yili, choraklar, ta'tillar
```

**Yangi server amallari** (har biriga test majburiy — CLAUDE.md 8-qoida):
`saveTeachingClass`, `deleteTeachingClass`, `saveScheduleSlots`,
`markTopicTaught`, `shiftClassPosition`, `saveAcademicCalendar` (admin).

**Dars jadvalini kiritish ekrani** — haftaning 6 kuni × 8 dars katakli
to'r. Katakni bosasiz → sinf tanlanadi. Mobil telefonda ham qulay bo'lishi
uchun bir vaqtda bitta kun ko'rsatiladi, chapga-o'ngga suriladi.

---

## 4. Eslatmalar va haftalik tayyorgarlik

### 4.1. Siz nima ko'rasiz

**Saytda:** asosiy sahifaning tepasida bitta qator —
*"Bu hafta 5 ta darsingiz bor, 2 tasiga material tayyor. Chorshanbadagi
7-A fizika darsiga hali hech narsa yo'q."* Bosilganda o'sha darsga olib boradi.

**Telegram botda:**
- **Yakshanba kechqurun** — kelasi haftaning xulosasi: qaysi kunlari qaysi
  mavzular, nimalar tayyor, nimalar yo'q. Xabar ostida "Tayyorlash" tugmasi,
  bosilganda sayt ochiladi va hammasi to'ldirilgan bo'ladi.
- **Dars kunidan oldingi kechqurun** — faqat material tayyor bo'lmasa:
  *"Ertaga 3-darsda 7-A fizika, mavzu: Tezlanish. Material tayyorlaymizmi?"*
- Xabarlar sizning tilingizda (lotin/kirill/rus).
- Istamasangiz — bildirishnomalarni sozlamalardan o'chirasiz.

### 4.2. Orqa tomonda

Bot allaqachon webhook qabul qiladi (`app/api/telegram/webhook/route.ts`),
demak nol qo'shimcha infratuzilma kerak emas.

```
lib/reminders/plan.ts                 kimga, qachon, nima yuborilishi (sof funksiya)
lib/reminders/render.ts               xabar matni, 3 tilda
app/api/cron/reminders/route.ts       Vercel Cron, CRON_SECRET bilan himoyalangan
```

Cron har kuni ikki marta ishlaydi (Toshkent vaqti bilan 19:00 va yakshanba
18:00). `plan.ts` bazadan o'qimaydi — unga tayyor ma'lumot beriladi, u faqat
"kimga nima yuborish kerak" ro'yxatini qaytaradi. Shu sababli testda
"ta'til haftasida xabar yuborilmasin", "material tayyor bo'lsa eslatma
yuborilmasin" kabi qoidalarni aniq sinash mumkin.

`User` ga ikkita maydon: `remindersEnabled Boolean @default(true)`,
`lastReminderAt DateTime?` (bir kunda ikki marta yubormaslik uchun).

---

## 5. Sun'iy intellekt qatlami

### 5.1. Siz nima ko'rasiz

Hech narsa — bu ko'rinmaydigan qatlam. Lekin uning natijasi: generatsiya
sifati, tezligi va narxi.

Ikkita AI xizmati birinchi kundan ulanadi: **Claude** (Anthropic) va
**Gemini** (Google). Gemini'ning bepul kvotasi bor, Claude esa murakkab
matnda kuchliroq. Birinchi hafta ikkalasi **teng ishlatiladi** va tizim
o'zi hisoblab boradi: qaysi biri o'zbek tilida yaxshiroq dars ishlanma
yozadi, qaysi biri arzonroq. Bir haftadan keyin siz admin panelida aniq
raqamni ko'rasiz va **taxmin bilan emas, ma'lumot bilan** qaror qilasiz.

### 5.2. Orqa tomonda

**Eng muhim tamoyil: barcha AI chaqiruvlari bitta eshikdan o'tadi.**

```
lib/llm/index.ts                faqat shu uchtasi tashqariga chiqadi:
                                runLlm, streamLlm, embedTexts
lib/llm/models.ts               modellar va narxlar jadvali
lib/llm/pricing.ts              xarajatni hisoblash (butun son, kasr xatosisiz)
lib/llm/router.ts               qaysi modelni tanlash + zaxira model
lib/llm/experiment.ts           Claude/Gemini teng taqsimoti
lib/llm/call.ts                 tekshir -> tanla -> chaqir -> yozib qo'y
lib/llm/log.ts                  LlmCall jadvaliga yozadigan YAGONA joy
lib/llm/providers/anthropic.ts
lib/llm/providers/gemini.ts
lib/llm/providers/fake.ts       testlar uchun soxta xizmat
```

Nega bitta eshik: CLAUDE.md ning 3-qoidasi har chaqiruvda xarajat
yozilishini talab qiladi. Agar chaqiruvlar kod bo'ylab sochilib ketsa, bu
qoida ertami-kechmi buziladi. Bitta eshik + **avtomatik tekshiruv testi**
(boshqa joyda AI kutubxonasini import qilishni taqiqlaydi) buni
mashina darajasida kafolatlaydi — xuddi hozir ranglar tekshirilganidek.

**Modellar va narxlar** (million token uchun, 2026-06-24 holatiga):

| Daraja | Model | Kirish | Chiqish | Qayerda |
|---|---|---|---|---|
| og'ir | `claude-opus-5` | $5.00 | $25.00 | dars ishlanma, murakkab mantiq |
| o'rta | `claude-sonnet-5` | $2.00 | $10.00 | test, byudjet siqilganda |
| arzon | `claude-haiku-4-5` | $1.00 | $5.00 | qayta yozish, sarlavha, o'yin mazmuni |

Gemini modellarining aniq nomlari va narxlari 04-bosqichda Google'ning
rasmiy hujjatidan tasdiqlanadi — ular tez almashadi, xotiradan yozish xato
bo'lardi.

**Prompt keshi — asosiy tejamkorlik.** Bitta mavzu bo'yicha kurikulum
konteksti barcha o'qituvchilar uchun bir xil. Claude buni keshlaydi va
ikkinchi o'qituvchi uchun **10 barobar arzon** o'qiydi. Shuning uchun
so'rov qismlari qat'iy tartibda: (1) o'zgarmas ko'rsatma, (2) mavzu
konteksti — ikkalasi keshlanadi, (3) o'qituvchiga xos parametrlar — kesh
chegarasidan keyin.

**Har chaqiruv `LlmCall` jadvaliga yoziladi** — muvaffaqiyatsizi ham.
Yozilmagan, lekin pul ketgan chaqiruv aynan 3-qoida oldini olmoqchi bo'lgan
zarar.

**Migratsiya `llmcall_system_calls`:** `LlmCall.userId` ixtiyoriy bo'ladi
(tizim chaqiruvlari uchun), `provider` ustuni qo'shiladi, `createdAt` ga
indeks (byudjet hisobi uchun).

---

## 6. Kredit tizimi

### 6.1. Siz nima ko'rasiz

Har generatsiya kredit yechadi. **Muhim:** kredit faqat material
muvaffaqiyatli tayyor bo'lgandan keyin yechiladi. Generatsiya yiqilsa yoki
natija sifatsiz chiqsa — **kredit qaytadi**, siz to'lamaysiz.

Balans har sahifaning tepasida turadi.

### 6.2. Orqa tomonda

Oqim: **band qilish (hold) → generatsiya → muvaffaqiyat: yechish (charge) /
xato: bo'shatish (release)**.

`User` ga yangi ustun `creditsHeld` — band qilingan kreditlar. Mavjud
balans = `creditBalance - creditsHeld`. Shunda `CreditTx` jadvaliga faqat
pul haqiqatan qimirlaganda yozuv tushadi — CLAUDE.md 4-qoidasi tom ma'noda
bajariladi.

Band qilish — bitta SQL operatori, "o'qib keyin yozish" emas:
```sql
UPDATE "User" SET "creditsHeld" = "creditsHeld" + $miqdor
WHERE id = $user AND "deletedAt" IS NULL
  AND "creditBalance" - "creditsHeld" >= $miqdor
```
Shu sabab 5 kreditga 10 ta parallel so'rov kelsa, Postgres qator qulflari
ularni navbatga qo'yadi va aniq 5 tasi o'tadi. Ortiqcha yechilmaydi.

Yechish va hujjatni `DONE` qilish **bitta tranzaksiyada** bo'ladi — shu
juftlik ikki marta pul yechishni struktura darajasida imkonsiz qiladi.

Jarayon o'rtada uzilib qolsa (brauzer yopildi), cron 15 daqiqadan keyin
hujjatni `FAILED` qiladi va kreditni qaytaradi.

---

## 7. Byudjet nazorati

Har AI chaqiruvidan oldin oylik va kunlik xarajat tekshiriladi:
80 % dan past — normal; 80–100 % — arzonroq modelga tushadi; 100 % dan
oshgan — chaqiruv umuman qilinmaydi. Gemini'ning bepul kvotasi tugasa,
tizim Claude'ga o'tadi — xato qaytarmaydi.

Kun chegarasi **Toshkent vaqti** bilan hisoblanadi (soat 05:00 da
tiklanadigan "kunlik" limit operatorni chalg'itadi).

Tekshiruv `lib/llm/call.ts` ichidan chaqiriladi — feature kodidan emas.
Bu 5-qoidaning intizomsiz ishlashining yagona yo'li.

---

## 8. Mavzularni aqlli qidirish (embedding)

Kurikulum mavzularini "ma'no bo'yicha" qidirish uchun har mavzu raqamli
vektorga aylantiriladi. Jadval va indekslar allaqachon qurilgan, lekin ichi
bo'sh — hech kim yozmaydi.

Anthropic'da bunday xizmat yo'q, shuning uchun **Gemini ishlatiladi**
(`gemini-embedding-001`, 768 o'lchov — mavjud jadvalga aynan mos, hech
narsa o'zgartirilmaydi).

Uchta yozuvchi: bir martalik skript (`pnpm embed:backfill`), cron (admin
mavzuni tahrirlaganda yangilab turadi) va so'rov paytida qidiruv matnini
vektorga aylantirish.

**Eng muhim detal:** har mavzuga `embeddingModel` va `embeddedAt` ustunlari
qo'shiladi. Admin mavzuni tahrirlaganda `embeddedAt` tozalanadi. Busiz
eng yomon nosozlik yuz beradi: **tashqaridan sog'lom ko'rinadigan, lekin
jimgina eski matnga javob beradigan qidiruv.**

---

## 9. Material tayyorlash konveyeri

### 9.1. Siz nima ko'rasiz

"Tayyorlash" tugmasini bosgandan keyin siz jarayonni ko'rib turasiz:

```
Dars ishlanma tayyorlanmoqda…
  ✓ Skelet: maqsadlar, materiallar, bosqichlar
  ⟳ Bosqichlar mazmuni
  ○ Uy vazifasi va baholash
```

Har bosqich tugagani sari matn ekranda paydo bo'la boshlaydi — 40 soniya
bo'sh ekranga qarab o'tirmaysiz. Internet uzilib qolsa yoki brauzerni
yopib qo'ysangiz — hech narsa yo'qolmaydi, qaytganingizda o'sha joydan
davom etadi.

### 9.2. Orqa tomonda

Generatsiya **bitta uzun so'rov emas, qisqa bosqichlar halqasi**. Har
bosqich bitta AI chaqiruvi, 60 soniyadan ancha kam, o'z natijasini bazaga
yozadi va "keyingi bosqich" qaytaradi. Sabab: Vercel'ning bepul tarifida
funksiya 60 soniyadan uzun ishlay olmaydi; bundan tashqari har bosqich
mustaqil qayta urinuvchan va progress — oqim emas, bazadagi haqiqiy holat.

```
server/generation-actions.ts            boshlaGeneratsiya (yaratish + hold)
app/api/generate/[id]/bosqich/route.ts  POST: ANIQ bitta bosqich
app/api/generate/[id]/holat/route.ts    GET: holat + tayyor bloklar
app/api/cron/stale-documents/route.ts   osilib qolganlarni tozalash
```

**Hujjat markdown sifatida saqlanmaydi** (CLAUDE.md "Qilma") — u bloklar
ro'yxati: sarlavha, matn, ro'yxat, jadval, maqsadlar, dars bosqichlari,
savol, javoblar kaliti, uy vazifasi, slayd, o'yin. Shu bitta struktura
to'rtta joyda ishlatiladi: AI unga qarab yozadi, muharrir uni tahrirlaydi,
eksport undan PPTX yasaydi, o'yin pleyeri undan o'qiydi.

**Sifat tekshiruvi** — AI'siz, sof mantiq bilan: kerakli bo'limlar bormi;
dars bosqichlari daqiqalari 45 daqiqaga to'g'ri keladimi (±10 %); har
savolga javob bormi; test variantlari takrorlanmaydimi; lotin so'ralganda
kirill harflar aralashib ketmaganmi; markdown belgilari (`**`, `##`) matnga
sizib kirmaganmi. Ball 0.5 dan past — hujjat `FAILED`, kredit qaytadi.
0.5–0.7 — tayyor, lekin "tekshirib chiqing" ogohlantirishi bilan.

---

## 10. Taqdimot

Slaydlar o'sha hujjat bloklari ichida yashaydi (`slide` bloki: sarlavha,
punktlar, o'qituvchi uchun izoh, maket turi).

**Uch yo'l bilan chiqadi:**
1. **Brauzerda** — to'liq ekran, smart doskada barmoq bilan suriladi,
   klaviatura bilan ham. Yangi kutubxona kerak emas. Slaydlar sahifa bilan
   birga yuklanadi, ya'ni **xonada internet uzilsa ham taqdimot davom
   etadi**. `?rejim=notiq` bilan o'qituvchi ko'rinishi (izohlar + keyingi
   slayd).
2. **PPTX fayl** — `pptxgenjs` kutubxonasi bilan. PowerPoint va Google
   Slides'da ochiladi.
3. **PDF** — yangi kutubxonasiz: chop etish uslublari + "Chop etish"
   tugmasi, brauzerning o'zi "PDF sifatida saqlash" beradi.

---

## 11. O'yinlar — smart doska va tarqatma varaq

Skrinshotlaringizdan aniqlandi: **maqsadli qurilma — smart doska**. Ya'ni
bitta katta teginishli ekran, o'quvchilarda qurilma yo'q. Bu butun
"real vaqtda ulanish" qatlamini rejadan olib tashlaydi — ancha soddaroq.

### 11.1. Uch qatlamli qurilish

Har o'yin bir xil sxema bo'yicha:

1. **AI faqat mazmun beradi** — so'z–ta'rif juftliklari, savol–javob.
   Arzon model yetarli.
2. **Panjarani algoritm quradi** — `lib/games/` dagi oddiy funksiyalar.
   **Bu juda muhim:** AI'dan "krossvord panjarasini chiz" deb so'rash —
   bu turdagi mahsulotlardagi eng keng tarqalgan xato. Model kesishgan
   harflarni deyarli hech qachon to'g'ri qilmaydi va natijani tekshirib
   bo'lmaydi. Algoritm esa har safar to'g'ri va testdan o'tadi.
3. **Ikki ko'rinish** — smart doska (to'liq ekran, katta tugmalar, BALL
   hisoblagichi) va A4 tarqatma varaq (javoblar kaliti alohida sahifada).

**Variantlar bepul keladi.** Har o'yin hujjat raqamidan olingan "urug'"
(seed) bilan quriladi. Bitta urug' — har doim bitta natija (test uchun
kerak). Urug'ni o'zgartirsangiz — boshqa variant. Ya'ni skrinshotdagi
**"4-variant"** avtomatik: bir mavzudan 4 xil varaq, o'quvchilar
ko'chira olmaydi.

### 11.2. O'yinlar ro'yxati

| # | O'yin | Doska | Varaq | Bosqich |
|---|---|---|---|---|
| 1 | **Omad g'ildiragi** (8 kategoriya) | ✓ | — | 15 |
| 2 | **So'z qidirish** (12×12, birinchi va oxirgi harfni bosish) | ✓ | ✓ | 15 |
| 3 | **Anagramma** (harf plitkalari, Tekshirish/Tozalash/O'tkazish) | ✓ | ✓ | 15 |
| 4 | Krossvord | ✓ | ✓ | 16 |
| 5 | Moslashtirish (juftlash) | ✓ | ✓ | 16 |
| 6 | Viktorina | ✓ | ✓ | 16 |
| 7 | Bo'shliqni to'ldirish | ✓ | ✓ | 16 |
| 8 | To'g'ri / noto'g'ri | ✓ | ✓ | 16 |
| 9 | Xotira kartalari | ✓ | — | 16 |
| 10 | Bingo | ✓ | ✓ | 16 |

6, 7 va 8-o'yinlar tayyor testning savollaridan **qo'shimcha AI
chaqiruvisiz** kelib chiqadi: bitta test — uchta o'yin, bepul.

Har o'yin `lib/games/` da bitta fayl. **Yangi o'yin qo'shish = bitta fayl +
ro'yxatga bitta qator + bitta test.** Boshqa hech narsaga tegilmaydi.

### 11.3. Dizayn qoidasi o'zgaradi

Skrinshotdagi uslub (to'q ko'k fon, porlash, emoji) hozirgi qoidalarga zid.
Siz tanlaganingizdek, **CLAUDE.md yumshatiladi:**

> **Istisno (o'yinlar):** `components/games/**` — emoji va erkin ranglar
> ruxsat etiladi. Sabab: smart doskadagi o'yin bolalar uchun bayramona
> ko'rinishi kerak. Qolgan barcha joyda 2 va 10-qoidalar kuchida.

**Amaliy detal:** `tests/tokens-guard.test.ts` ga o'sha papka uchun istisno
qo'shilmasa, birinchi o'yin PR'i CI'da yiqiladi. Buni ham o'sha bosqichda
qilaman.

*Bitta tavsiya (majburiy emas): ikonkalarda emoji o'rniga lucide
ikonkalarini ishlatsa, har xil smart doskalarda bir xil chiqadi — emoji
Android, Windows va iOS'da turlicha ko'rinadi, ba'zi doskalarda umuman
chiqmaydi. Ranglarda esa istisnodan to'liq foydalanamiz.*

---

## 12. To'lov (qo'lda karta)

Boshida: siz SKU tanlaysiz → tizim 8 belgili kod beradi → karta raqami va
summa ko'rsatiladi → **to'lov izohiga o'sha kodni yozasiz** → chek rasmini
yuklaysiz → adminga Telegram orqali rasm bilan xabar boradi → admin
tasdiqlaydi → kredit tushadi va sizga bot orqali xabar keladi.

Kod izohda bo'lgani uchun admin chekni uch soniyada moslashtiradi.
Bir chek ikki marta ishlatilmaydi (rasm "barmoq izi" saqlanadi).
Chek rasmlari shaxsiy ma'lumot — yopiq saqlanadi, admin sahifasida qisqa
muddatli havola orqali ko'rinadi.

Payme/Click keyinroq, xuddi shu jadval ustiga qo'shiladi.

---

## 13. Bosqichlar ketma-ketligi

Har bosqich — bitta branch, bitta PR, bitta vazifa, va `docs/sessions/`
ichida mavjud uchtasi bilan bir uslubdagi hujjat.

| # | Nima quriladi | Natija |
|---|---|---|
| **04** | AI qatlami: Claude + Gemini, narx hisobi, byudjet shifti, majburiy jurnal, A/B, admin "Sifat" sahifasi | Ikkala xizmatga sinov chaqiruvi ishlaydi va xarajat bazaga yoziladi |
| **05** | Embedding: Gemini, backfill skripti, cron, eskirish ustunlari | Fizika 7 to'liq indekslangan; ma'no bo'yicha qidiruv birinchi marta ishlaydi |
| **06** | Kredit: band qilish / yechish / qaytarish, admin kredit berishi, balans ko'rsatkichi | Admin beta o'qituvchiga kredit bera oladi |
| **07** | **O'quv yili kalendari + taqvim-mavzu reja**: choraklar, ta'tillar, `Topic.quarter`, CSV'ga `chorak` ustuni, hafta hisobi, "Rejam" sahifasi | Chorak bo'yicha mavzular ro'yxati ko'rinadi |
| **08** | **Dars ishlanma generatsiyasi**: fan → sinf → chorak → mavzu tanlash, bosqichli konveyer, sifat tekshiruvi, oddiy ko'ruvchi | **Birinchi haqiqiy dars ishlanma, kredit yechilgan holda** |
| **09** | **Sinflar, dars jadvali va haftalik bosh sahifa**: sinf qo'shish, jadval kiritish, "qaysi mavzudamiz" avtomatik hisobi, bir teginishda tuzatish | Asosiy sahifa ertangi darsingizni va mavzuni o'zi ko'rsatadi |
| **10** | Test generatsiyasi | Ikkinchi material turi o'sha konveyerda |
| **11** | To'liq interfeys: sehrgar, hujjatlar ro'yxati, xato va yuklanish ekranlari, tungi rejim, uch tilda matnlar | O'qituvchi butun oqimni dasturchisiz bajaradi |
| **12** | **Eslatmalar**: saytdagi qator + Telegram botdagi haftalik va kunlik xabarlar | Platforma o'zi eslatib turadi |
| **13** | Hujjat muharriri: bloklarni tahrirlash, avtosaqlash | Model xato qilgan 10 % ni tuzatish mumkin |
| **14** | Taqdimot: slaydlar, brauzer pleyeri, chop etish | Smart doskaga tayyor taqdimot |
| **15** | **O'yinlar poydevori + skrinshotdagi 3 o'yin** (Omad g'ildiragi, So'z qidirish, Anagramma) + CLAUDE.md istisnosi | Smart doskada birinchi o'yin |
| **16** | Qolgan 7 o'yin | To'liq to'plam |
| **17** | Eksport: PPTX, DOCX, ulashish havolasi | Yuklab olish va chop etish |
| **18** | Qo'lda karta to'lovi | Daromad |

**Muddat haqida rostini aytaman.** Avvalgi rejada 6 hafta edi, lekin
taqvim-mavzu reja, dars jadvali va eslatmalar qo'shilishi bilan hajm
o'sdi. Realistik baho:

- **04–09 bosqich ≈ 3–4 hafta** → birinchi o'qituvchilar haqiqiy dars
  ishlanma olishadi va bosh sahifa ularning jadvalini biladi. **Bu eng
  muhim chiziq.**
- **10–12 ≈ 1,5–2 hafta** → test, to'liq interfeys, eslatmalar. Shu yerda
  mahsulot "kundalik asbob"ga aylanadi.
- **13–18 ≈ 3 hafta** → muharrir, taqdimot, o'yinlar, eksport, to'lov.

Jami ≈ 8–9 hafta. Siqish kerak bo'lsa, 16-bosqichni (qolgan 7 o'yin)
keyinga surish eng arzon qurbonlik — har o'yin mustaqil fayl, keyin
bittalab qo'shiladi.

**Nega to'lov oxirida:** beta o'qituvchilar 06-bosqichdan kredit sovg'a
sifatida oladi. Pul almashinuvi ikkinchi oyni xohlaydigan o'qituvchilar
paydo bo'lgunga qadar kerak emas. Generatorni oldin qurish degani — to'lov
ekrani odamlar allaqachon foydalangan mahsulotga qarshi quriladi, ishlamagan
narsaga kassa yozishning klassik xatosi bo'lmaydi.

**Yangi sozlamalar** (`.env`): `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`,
`LLM_AB_ENABLED`, `LLM_DAILY_BUDGET_USD`, `LLM_USER_DAILY_BUDGET_USD`,
`CRON_SECRET`, `MANUAL_CARD_NUMBER`, `MANUAL_CARD_HOLDER`.

---

## 14. Nima uchun bu platformaning o'xshashi bo'lmaydi

1. **Bo'sh sahifa yo'q.** ChatGPT ham, Gamma ham sizdan "nima kerak?" deb
   so'raydi. EduDast sizning jadvalingizni biladi va ertangi darsingizni
   o'zi taklif qiladi. Bu — texnik jihatdan arzon, lekin foydalanish
   tajribasida eng katta farq.
2. **Kurikulumga bog'liqlik ko'rinadi.** Har materialda "DTS maqsadlari:
   3/3 qamrab olingan" belgisi. Umumiy AI buni bera olmaydi, chunki u
   sizning taqvim-mavzu rejangizni bilmaydi.
3. **Bitta mavzudan butun to'plam.** Mavzu tanlangach bitta tugma bilan
   dars ishlanma + test + taqdimot + o'yin + tarqatma varaq. Kurikulum
   konteksti beshalasi uchun bir xil bo'lgani uchun prompt keshi tufayli
   qolganlari deyarli bepul tushadi. Bu ham narx ustunligi, ham
   "hammasi bir joyda" hissi.
4. **Telegram — ikkinchi interfeys.** O'zbekistonda Telegram brauzerdan
   kuchliroq kanal. Bot sizga yakshanba kuni haftani eslatadi, siz bitta
   tugma bosib tayyorlaysiz.

Yo'l-yo'lakay tuzatiladigan kichik, lekin sezilarli narsalar (11-bosqich
bilan birga): tungi rejim tugmasi (kutubxona o'rnatilgan, lekin ulanmagan —
hozir barcha tungi uslublar o'lik turibdi), bosh sahifada "Kirish" tugmasi
yo'qligi (foydalanuvchi manzilni qo'lda yozishi kerak), ishlatilmayotgan
o'lik kod.

---

## 15. Eng katta xavflar

1. **Hafta-mavzu hisobi noto'g'ri bo'lsa, butun mahsulot noto'g'ri
   ishlaydi.** Ta'til, qisqargan chorak, orqada qolgan sinf, ikki haftaga
   cho'zilgan mavzu — hammasi to'g'ri hisoblanishi kerak. Shuning uchun bu
   funksiya bazaga bormaydigan sof mantiq qilib yoziladi va **eng ko'p test
   shu yerga** yoziladi.
2. **O'zbek tilidagi matn sifati — mahsulotning o'zi.** Avtomatik tekshiruv
   strukturani tutadi, pedagogikani emas. **11-bosqichdan oldin bitta real
   o'qituvchi 20 ta dars ishlanmasini (10 tasi Claude, 10 tasi Gemini)
   1–5 shkalada baholasin.** Kod emas, o'sha raqam qaysi xizmat qaysi ishda
   qolishini hal qiladi.
3. **Bitta hujjat narxi 08-bosqich ishga tushmaguncha noma'lum.** Birinchi
   kundan o'lchang. Dars ishlanma $0.40 turib, kredit $0.05 ga sotilsa —
   buni 3-haftada bilish 8-haftada bilishdan yaxshi.
4. **Krossvord panjarasini joylash — hisoblash jihatidan og'ir masala.**
   Qat'iy vaqt chegarasi (200 ms) va "joylashmagan so'zlarni tashlab
   yuborish" strategiyasi kerak, aks holda server osilib qoladi.
5. **O'yin istisnosi kengayib ketmasin.** `components/games/**` dan
   tashqarida emoji va erkin rang baribir taqiqlangan. Istisno faqat shu
   papkani qamrasin, aks holda dizayn tizimi asta-sekin yemiriladi.
6. **Muharrirda va o'yinlarda hajm kengayishi** — jadvalni buzadigan eng
   ehtimolli sabab. Muharrir birinchi versiyasi: matn tahrirlash, o'chirish,
   ko'chirish, nusxalash. Sudrab tashlash yo'q, orqaga qaytarish yo'q.
7. **Neon bazasi 0.5 GB** — yangi indekslarning har biri migratsiya izohida
   asoslanadi. `LlmCall` jadvali o'sishini kuzating (u ataylab hech qachon
   o'chirilmaydi).

---

## 16. Tekshirish

Bu muhitda `node_modules` o'rnatilmagan, shuning uchun har bosqich boshida
`pnpm install --frozen-lockfile`. **Har bosqich oxirida quyidagini men o'zim
ishga tushiraman va natijasini sizga to'liq ko'rsataman:**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Birortasi yiqilsa PR ochilmaydi — tuzatiladi va qayta ishga tushiriladi.
Yiqilgan natijani yashirmayman.

**Siz qo'lda tekshiradigan narsalar:**

- **04:** Sinov chaqiruvi → ikkala xizmatdan javob va bazada xarajat qatori.
  Keyin byudjetni 0 qilib qo'ying → chaqiruv umuman qilinmasligi kerak.
- **05:** Backfill skriptini ishga tushiring → mavzular indekslansin.
- **06:** Admin panelidan o'zingizga kredit bering → balans va tarix to'g'ri.
- **07:** Chorak sanalarini kiriting → "Rejam" sahifasida mavzular to'g'ri
  choraklarga bo'lingan bo'lsin. **Ta'til qo'ying → mavzular siljisin.**
- **08:** Telefondan dars ishlanma yarating. Tekshiring: kredit aniq bir
  marta yechilgan, sifat bahosi bor. Keyin **ataylab yiqiting** (AI kalitini
  buzing) → kredit qaytishi kerak.
- **09:** Dars jadvalingizni kiriting → bosh sahifada haftangiz va har
  kunning mavzusi to'g'ri chiqsin. **Mavzuni bir orqaga suring** → keyingi
  hisoblar yangi nuqtadan ketsin.
- **12:** Yakshanba kechqurun botdan xabar kelsin; material tayyor darsga
  eslatma kelmasin.
- **14:** Smart doskada to'liq ekran, barmoq bilan surish.
- **15–16:** Har o'yinni smart doskada **barmoq bilan** sinang (sichqoncha
  bilan emas — tugmalar kichik chiqishi mumkin). Bitta hujjatni ikki marta
  oching → natija bir xil bo'lsin. Boshqa variant so'rang → boshqacha chiqsin.
- **18:** Chek yuklang, admin tasdiqlasin. Keyin **o'sha rasmni qayta
  yuklang** → rad etilishi kerak.
