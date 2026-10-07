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
---

## `notFound()` 404 emas, 200 qaytaradi

**Qachon:** 15-sessiya (o'yinlar poydevori). Topildi, ataylab tuzatilmadi.

**Nima:** hujjat marshrutlarida `notFound()` chaqirilganda sahifa to'g'ri
render bo'ladi, lekin HTTP status 404 emas, **200**. Butun ilovada shunday va
15-sessiyadan oldin ham shunday bo'lgan (`/taqdimot` ham 200 beradi). Marshrut
umuman mavjud bo'lmaganda (`/uz/butunlay-yoq`) esa 404 to'g'ri qaytadi.

**Nega:** Next.js hujjatlashtirgan xatti-harakat — oqimli (streamed) javobda
status 200 bo'ladi, chunki sarlavhalar allaqachon yuborilgan. Bizda oqim OTA
LAYOUTLARDA boshlanadi (`[locale]/layout.tsx` va `ish/layout.tsx` dagi
`await`lar), ya'ni sahifa kodi ishga tushishidan oldin — shuning uchun
`notFound()` ni sahifa ichida qayerga qo'yish ahamiyatsiz.

SEO zarari yo'q: javobda `<meta name="robots" content="noindex">` bor, ya'ni
Google "soft 404" deb belgilasa ham indekslamaydi.

**Qachon qaytiladi:** 404 statusi tashqi tahlil yoki compliance uchun kerak
bo'lganda. Yechim `proxy.ts` da mavjudlik tekshiruvi, lekin narxi katta:
proxy har navigatsiyada (RSC prefetch ham) ishlaydi va DB so'rovi har havolaga
50-150 ms qo'shadi — `proxy.ts` ning o'z izohi bazaga borishni ataylab
taqiqlaydi.

**To'liq diagnostika va sinab ko'rilganlar ro'yxati:**
`docs/notes/notfound-200-status.md` — noldan qaytadan tekshirmaslik uchun
o'sha yerda nima ishlamagani ham yozilgan.
