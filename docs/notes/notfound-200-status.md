# `notFound()` 404 emas, 200 qaytaradi — diagnostika natijasi

**Holat:** ma'lum, tuzatilmagan. Alohida PR uchun (15-sessiyada topildi).
**Bu yozuv nima uchun:** sababni noldan qaytadan qidirmaslik uchun. Pastda
nima sinab ko'rilgani ham yozilgan — ularni takrorlash kerak emas.

## Belgi

Hujjat marshrutlarida `notFound()` chaqirilsa sahifa to'g'ri render bo'ladi
(not-found UI ko'rinadi), lekin HTTP status **200** bo'ladi:

| So'rov | Status |
|---|---|
| `/uz/ish/hujjat/<id>/varaq` (g'ildirak — varaq yo'q) | 200 |
| `/uz/ish/hujjat/yoq-shunday/oyin` (hujjat yo'q) | 200 |
| `/uz/ish/hujjat/<id>/taqdimot` (14-sessiya marshruti) | 200 |
| `/uz/butunlay-yoq` (marshrut umuman yo'q) | **404** |

Ya'ni bu bitta marshrutning muammosi emas — **butun ilovada shunday**, va u
15-sessiyadan oldin ham shunday bo'lgan (`/taqdimot` ham 200 beradi).

## Sabab

Next.js hujjatida yozilgan xatti-harakat
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`):

> Next.js will return a `200` HTTP status code for **streamed responses**,
> and `404` for non-streamed responses.

Va `loading.md` dagi "Status Codes" bo'limi:

> The response body starts streaming when a Suspense fallback renders (for
> example, a `loading.tsx`) or **when a Server Component suspends under a
> `Suspense` boundary**. Place `notFound()` before those boundaries and
> before any `await` that may suspend.
>
> To start streaming, the response headers must be set. This is why it is
> not possible to change the status code after streaming started.

**Bizda oqim OTA LAYOUTLARDA boshlanadi**, sahifa kodi ishga tushishidan
oldin:

- `app/[locale]/layout.tsx` — `await params`, `await getTranslations(...)`
- `app/[locale]/ish/layout.tsx` — `await requireOnboarded()`,
  `await getTranslations("Ish")`

Shuning uchun sahifa ichida `notFound()` ni qayerga qo'yish ahamiyatsiz.

## Nima sinab ko'rilgan (TAKRORLAMA)

| Sinov | Natija |
|---|---|
| `notFound()` ni sahifaning ENG BIRINCHI operatori qilish (`auth()` va `prisma` dan oldin) | 200 |
| `next-intl` proxy javobini chetlab o'tish (`NextResponse.next()` qaytarish) | 200 |
| `app/[locale]/ish/hujjat/[id]/loading.tsx` ni olib tashlash | 200 |
| `next build && next start` (prod rejimi, dev artefakti emasligini tekshirish) | 200 |

Birinchi uchtasi muvaffaqiyatsiz bo'lgani mantiqiy: oqim layoutlarda
boshlanadi, ya'ni sahifa va uning `loading.tsx` i bilan hal bo'lmaydi.

## SEO zarari yo'q

Javobda `<meta name="robots" content="noindex">` bor (tekshirildi). Next
buni streaming holatida o'zi qo'yadi. Google "soft 404" deb belgilashi
mumkin, lekin `noindex` tufayli indekslamaydi — hujjat buni aniq aytadi.

## Yechim va uning narxi

Next hujjati yo'lni ko'rsatadi:

> If you need a 404 status, for compliance or analytics, ensure the resource
> exists **before the response body is streamed** ... You can run this check
> in `proxy` to rewrite missing slugs to a not-found route, or produce a 404
> response. **Keep proxy checks fast, and avoid fetching full content there.**

Ya'ni mavjudlik tekshiruvi `proxy.ts` ga ko'chadi. **NARXI:**

1. `proxy.ts` HAR navigatsiyada ishlaydi — RSC prefetch ham. Hujjat
   mavjudligini tekshirish uchun bazaga borish kerak, bu esa har havolaga
   **50-150 ms** qo'shadi. `proxy.ts` ning o'z izohi buni ataylab taqiqlaydi:
   sessiya faqat cookie'dan o'qiladi, bazaga borilmaydi.
2. Tekshiruv hujjat EGASINI ham bilishi kerak (`userId` bo'yicha filtr),
   ya'ni sessiyani dekodlash + DB so'rov.
3. Natijada 404 statusi uchun butun ilovaning navigatsiya tezligi to'lanadi.

## Qarorni kim qabul qiladi

Bu mahsulot qarori, texnik emas: 404 statusi faqat tashqi tahlil va
compliance uchun kerak (foydalanuvchi baribir to'g'ri ekranni ko'radi,
qidiruv tizimi indekslamaydi). Shuning uchun tuzatish alohida PR'da va
narxi bilan birga ko'rib chiqiladi.

Agar kerak bo'lsa, arzonroq variantlar ham bor:

- faqat `deletedAt`/mavjudlikni emas, **ID SHAKLINI** proxy'da tekshirish
  (cuid naqshi) — bazasiz, lekin faqat buzuq URL'ni tutadi;
- `global-not-found.js` (Next 16, eksperimental) — u faqat marshrutga
  umuman mos kelmagan URL'lar uchun, bizning holatga tegishli emas.
