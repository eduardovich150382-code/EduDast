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

## `shiftClassPosition` rejadan OLDINDA turgan sinfda siljimaydi

**Qachon:** 09-sessiya.

**Nima:** `server/progress-actions.ts` dagi `shiftClassPosition(…, "forward")`
rejadan oldinda ketayotgan sinfda `TopicProgress` ga `DONE` yozadi, lekin
bosh sahifadagi joriy mavzu O'ZGARMAYDI — ya'ni tugma bosilgandek, lekin
natija ko'rinmaydi.

**Nega shunday:** sinfning pozitsiyasi sxemada indeks ustuni emas, oxirgi
`DONE` `TopicProgress` ning **sanasi** (`taughtOn`). `lib/calendar/placement.ts`
dagi `anchorShift` bu sanadan `delta` hisoblaydi va uni `Math.max(0, delta)`
bilan qisadi — ya'ni rejani faqat OLDINGA suradi, orqaga tortmaydi. Sinf
allaqachon rejadan oldinda bo'lsa `delta` 0 ga tushadi.

Rejada yoki rejadan orqada turgan sinflarda (amalda ko'pchilik holat) to'g'ri
ishlaydi, shuning uchun bu sessiyada to'siq deb hisoblanmadi.

**Qachon qaytiladi:** o'qituvchilardan "› bosdim, hech narsa o'zgarmadi"
degan shikoyat kelsa. Tuzatish: `TeachingClass` ga `topicOffset Int @default(0)`
ustuni qo'shib, surishni sana emas, INDEKS bo'yicha qilish. Bu 09-sessiya
spetsifikatsiyasidagi sxemada yo'q edi, shuning uchun qo'shilmadi.

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
