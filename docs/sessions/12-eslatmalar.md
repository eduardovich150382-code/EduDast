# 12-sessiya — Eslatmalar: sayt va Telegram bot

Kontekst: dars jadvali (09) va to'liq interfeys (11) tayyor. Bu sessiyada
platforma **o'zi eslatib turadigan** bo'ladi. Bot allaqachon webhook qabul
qiladi (`app/api/telegram/webhook/route.ts`), demak yangi infratuzilma
kerak emas.

## Bajariladigan ish

### 1. Migratsiya `reminders`
`User` ga:
- `remindersEnabled Boolean @default(true)`
- `weeklyDigestEnabled Boolean @default(true)`
- `lastReminderAt DateTime?` (bir kunda ikki marta yubormaslik uchun)

### 2. `lib/reminders/plan.ts` — sof funksiya
Bazaga bormaydi, `new Date()` chaqirmaydi. Kirish: o'qituvchi, uning
sinflari, hafta darslari, har darsga tayyorlangan hujjatlar, joriy vaqt.
Chiqish: yuboriladigan xabarlar ro'yxati (kimga, qanday tur, qaysi darslar).

Qoidalar:
- Ta'til haftasida xabar yuborilmaydi
- Materiallari to'liq tayyor darsga kunlik eslatma yuborilmaydi
- Bitta kunda bitta foydalanuvchiga bittadan ortiq xabar yo'q
- `remindersEnabled = false` → hech narsa
- Yakshanba xulosasi `weeklyDigestEnabled` ga bog'liq, alohida

### 3. `lib/reminders/render.ts`
Xabar matni **uchala tilda** (foydalanuvchining `locale` i bo'yicha).
Telegram Markdown emas, `parse_mode: "HTML"` yoki sof matn — o'zbek
apostroflari Markdown'ni buzadi.

Haftalik xulosa: kunlar, mavzular, nima tayyor / nima yo'q.
Kunlik: faqat tayyor bo'lmagan ertangi darslar.
Ikkalasida ham saytga havola (to'g'ridan o'sha darsga).

### 4. `app/api/cron/reminders/route.ts`
`CRON_SECRET` bearer (yo'q bo'lsa 503 — 05-sessiyadagi namunadek).
`vercel.json` da ikkita cron:
- har kuni Toshkent vaqti 19:00 (UTC 14:00) — kunlik
- yakshanba Toshkent vaqti 18:00 (UTC 13:00) — haftalik

Bir chaqiruvda 200 tagacha foydalanuvchi, keyingisiga qoldiradi.
Telegram yuborish xatolari alohida ushlab olinsin — bitta xato butun
cron'ni yiqitmasin. Bloklangan foydalanuvchi (`403`) uchun
`remindersEnabled = false` qo'y.

### 5. Saytdagi qator
Bosh sahifaning tepasida: "Bu hafta 5 ta darsingiz bor, 2 tasiga material
tayyor. Chorshanbadagi 7-A fizika darsiga hali hech narsa yo'q."
Bosilganda o'sha darsga olib boradi. `lib/reminders/plan.ts` ning o'sha
mantig'ini qayta ishlatadi.

### 6. Bot buyruqlari
Webhook hozir faqat `/start` ni biladi. Qo'sh:
- `/bugun` — bugungi darslar va mavzular
- `/hafta` — haftalik xulosa
- `/eslatma` — eslatmalarni yoqish/o'chirish

`lib/telegram/api.ts` ga kerak bo'lsa `sendMessage` parametrlarini kengaytir
(inline tugma). Bot tokeni hech qayerda log qilinmasin (mavjud intizom).

### 7. Sozlamalar sahifasi
`app/[locale]/ish/sozlamalar/page.tsx` — eslatmalarni yoqish/o'chirish,
til almashtirish, chiqish. `server/settings-actions.ts`:
`saveReminderPrefs` — `requireAuth()` birinchi, keyin Zod.

### 8. i18n
`Reminders`, `Settings` namespace'lari + `Bot` namespace'iga yangi
kalitlar, **uchala** faylda.

### 9. Testlar
- `reminders-plan` — ta'til haftasi; material tayyor; `remindersEnabled=false`;
  bir kunda ikkinchi xabar; jadvalsiz o'qituvchi; sinfsiz o'qituvchi
- `reminders-render` — uchala tilda matn, apostrof Telegram'da buzilmaydi
- `settings-actions` — 8-qoida
- `telegram-webhook` buyruqlari uchun test (sof handler mantig'i)

## Qilma
- Push-bildirishnoma, SMS, email — YO'Q
- Yangi cron infratuzilmasi — YO'Q, Vercel Cron yetarli
- Bot orqali to'g'ridan generatsiya — YO'Q (keyingi bosqich)

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Yakshanba kechqurun botdan haftalik xulosa keladi
- [ ] Material tayyor darsga kunlik eslatma kelmaydi
- [ ] `/bugun` va `/hafta` buyruqlari ishlaydi
- [ ] Eslatmani o'chirsang xabar kelmaydi
- [ ] Ta'til haftasida xabar kelmaydi

## Ish tartibi
1. `feat/eslatmalar` branch'ida ishla
2. Cron'ni qo'lda chaqirib sinab ko'r (`CRON_SECRET` bilan)
3. Menga kelgan xabarlarning skrinshotini ko'rsat
4. PR och
