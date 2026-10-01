# Kechiktirilgan qarzlar

Ataylab qilinmay qoldirilgan ishlar. Har yozuv: **nima** qilinmadi, **nega**,
va **qachon** qaytiladi. Maqsad — qarorni esda tutish, keyingi sessiyada uni
qaytadan muhokama qilmaslik.

---

## `LessonPlan` ishga tushirilmadi

**Qachon:** 09-sessiya (sinflar, dars jadvali va haftalik bosh sahifa).

**Nima:** `prisma/schema.prisma` dagi `LessonPlan` modeli 01-sessiyadan beri
bo'sh turadi. 09-sessiya spetsifikatsiyasi unga `teachingClassId` qo'shib
"ishga tushirish"ni rejalashtirgan edi. Qilinmadi — modelga TEGILMADI, lekin
sxemadan ham o'chirilmadi.

**Nega:** bosh sahifada "tayyor materiallar"ni ko'rsatish uchun `Document` ni
`userId + topicId` bo'yicha o'qish yetarli. `LessonPlan` ni ishga tushirish
yana bitta yozuv oqimi (dars yaratilganda qator ochish, `documentIds[]` ni
sinxron saqlash) va yana bitta test to'plamini talab qilardi — bosh sahifa
uchun hech qanday qo'shimcha foyda bermasdan.

**Qachon qaytiladi:** aniq dars yozuvi kerak bo'lganda. Ikki ehtimolli sabab:

1. **Eslatmalar (12-sessiya)** — "ertaga 3-darsda 7-A, materiali yo'q" kabi
   bildirishnoma aniq dars qatoriga tayanadi.
2. **Bir darsga bir nechta hujjat aniq bog'lanishi** kerak bo'lganda —
   masalan o'qituvchi bitta mavzuni ikki marta, turli materiallar bilan
   o'tsa. Hozir `Document(userId + topicId)` ularni ajratmaydi.

Qaytilganda `classLabel` ustuni (hozir `String`, majburiy) ham ko'rib
chiqilishi kerak: sinf endi `TeachingClass` orqali keladi.

---

## `shiftClassPosition` "oldinga" — ko'rinadigan natija bermaydi

**Qachon:** 09-sessiya. PR'dan keyin aniqlashtirildi.

**Nima:** `shiftClassPosition(…, "forward")` — ya'ni › tugmasi —
`TopicProgress` ga `DONE` yozadi, lekin EKRANDA hech narsa o'zgarmaydi: na
joriy mavzu, na haftaning kunlari. Bu "sinf rejadan oldinda" degan chekka
holat emas — **amalda har doim shunday**.

**Nega shunday:** sinfning pozitsiyasi sxemada indeks ustuni emas, oxirgi
`DONE` `TopicProgress` ning **sanasi** (`taughtOn`). `PlacementAnchor` ning
ma'nosi — "mavzuning OXIRGI soati shu kuni bo'lgan". › esa aynan JORIY
mavzuni BUGUNGI sana bilan belgilaydi, reja esa o'sha mavzuni allaqachon
bugunga qo'ygan. Ya'ni anchor rejani o'zi turgan joyiga "qadaydi":
`anchorShift` dagi `delta` nolga teng va reja siljimaydi.

Boshqacha aytganda, `currentTopicIdOn(today)` uchun bu **qo'zg'almas nuqta**.
Sana-anchor semantikasi bilan › ni ishlaydigan qilish MUMKIN EMAS — qancha
bosilmasin, natija bir xil.

Buni `lib/calendar/position.ts` dagi `forwardMoves` oldindan hisoblaydi
(rejani faraziy anchor bilan qayta quradi va natijani solishtiradi), UI esa
tugmani o'chirib, "Reja allaqachon shu mavzuda" izohini ko'rsatadi. Ya'ni
o'qituvchi ishlamaydigan tugmani bosmaydi — lekin tugmaning O'ZI hozircha
foydasiz.

‹ (orqaga) ISHLAYDI: u oxirgi `DONE` qatorni `PLANNED` ga qaytaradi, anchor
esa oldingi `DONE` nuqtaga tushadi va reja haqiqatan qayta hisoblanadi.
Lekin › hech qachon `DONE` qator yarata olmagani uchun, qator faqat
`markTopicTaught` yoki seed orqali paydo bo'ladi.

**Qachon qaytiladi:** keyingi sessiyada, mavzu surish kerak bo'lganda.
Tuzatish: `TeachingClass` ga `topicOffset Int @default(0)` ustuni qo'shib,
surishni sana emas, INDEKS bo'yicha qilish — `placement.ts` ga `anchor`
o'rniga (yoki yonida) `startOffset` berish. Bu 09-sessiya spetsifikatsiyasidagi
sxemada yo'q edi, shuning uchun qo'shilmadi.

---

## `mode: "week"` da bayram ta'siri taxminiy

**Qachon:** 09-sessiya.

**Nima:** dars jadvali kiritilmagan sinf uchun `lib/calendar/position.ts`
sun'iy `FALLBACK_WEEKDAYS` (dushanba–shanba) ishlatadi va haftada
`lessonsPerWeek` ta nomzod kun qoldiradi. Bayram dushanbaga tushsa, haqiqatda
seshanba–payshanba o'qiydigan sinf uchun ham nomzod kuni "yeyiladi".

**Nega:** `placeTopics` bo'sh `weekdays` da bitta ham slot qaytarmaydi, ya'ni
jadvalsiz holatda "bu hafta qaysi mavzu" ham hisoblanmay qolardi. Taxminiy
javob — hech qanday javobdan yaxshi.

**Qachon qaytiladi:** qaytilmaydi. Yechim — o'qituvchi jadvalni kiritishi, va
bosh sahifa aynan shuni taklif qiladi ("Dars jadvalini kiritish"). Agar
jadvalsiz foydalanuvchilar ulushi katta bo'lib qolsa, taklifni kuchaytirish
kerak, hisobni emas.
