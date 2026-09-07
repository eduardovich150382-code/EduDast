2-sessiya: Telegram autentifikatsiya, onboarding va /ish skeleti.

Poydevor tayyor (PR #1 merge qilingan): Next.js 16, Prisma 7 + Neon,
next-intl, dizayn tokenlari, 13 model. CLAUDE.md qoidalariga amal qil.

## Avval tekshir

Auth.js (next-auth v5) Next.js 16 ni to'liq qo'llab-quvvatlaydimi —
Context7 orqali aniqla. Agar muammo bo'lsa, Auth.js'siz variantni taklif qil:
`jose` bilan imzolangan httpOnly session cookie + o'z `auth()` helperim.
Qaysi yo'lni tanlashingni bajarishdan oldin menga bir xatboshida asosla.

## Bajariladigan ish

### 1. Telegram Login — server tomoni
- `lib/auth/telegram.ts`: Telegram Login Widget payload'ini tekshiruvchi funksiya
  - secret = SHA256(bot_token)
  - HMAC-SHA256 bilan `hash` ni tekshirish, taqqoslash constant-time bo'lsin
  - `auth_date` 5 daqiqadan eski bo'lsa rad et (replay hujumiga qarshi)
  - Bot tokeni HECH QACHON log qilinmasin va xato matniga tushmasin
- `/api/auth/telegram` route: payload'ni tekshiradi → User yaratadi yoki yangilaydi
  (telegramId bo'yicha upsert: fullName, username, photo saqlanmaydi — kerak emas)
  → sessiya cookie'sini qo'yadi → /onboarding yoki /ish ga yo'naltiradi

### 2. Sessiya
- httpOnly, secure, sameSite=lax cookie, 30 kun
- `auth()` helper: server component va server action'larda joriy User ni qaytaradi
- `requireAuth()`: User yo'q bo'lsa /kirish ga redirect
- Logout: cookie o'chirish + /kirish ga qaytish

### 3. Dev bypass (lokal ishlash uchun)
Telegram Login localhost'da ishlamaydi (BotFather domen talab qiladi).
- `DEV_LOGIN_ENABLED` env o'zgaruvchisi (.env.example ga qo'sh, default "false")
- Faqat `NODE_ENV === "development"` VA `DEV_LOGIN_ENABLED === "true"` bo'lsa
  /kirish sahifasida "Dev sifatida kirish" tugmasi ko'rinsin
- Ikkala shart ham bo'lmasa kod yo'li umuman mavjud bo'lmasin (production build'da)
- Bu yo'l seed'dagi test foydalanuvchisiga kiradi

### 4. Sahifalar
- `/kirish` — Telegram Login Widget (TELEGRAM_BOT_USERNAME env'dan),
  qisqa tushuntirish, dizayn tokenlari bilan, mobil birinchi
- `/onboarding` — 3 qadam, har qadam alohida ekran (modal emas):
  1. Fan(lar) tanlash (ko'p tanlov) → User.subjects
  2. Sinf(lar) tanlash (ko'p tanlov) → User.grades
  3. Viloyat → User.region
  Har qadamdan keyin saqlanadi (yarim yo'lda chiqib ketsa yo'qolmasin)
  Tugagach → /ish
- `/ish` — hozircha bo'sh ish stoli skeleti:
  "Salom, {ism}" + kredit balansi (0) + "Tez orada" bloklari
  Haqiqiy funksiyalar 3–5-sessiyalarda keladi
- Barcha matn next-intl orqali, uchala tilda

### 5. Middleware
- `/ish/*`, `/onboarding` — auth talab qiladi
- Auth bor, lekin onboarding tugallanmagan (subjects bo'sh) → /onboarding ga
- Auth bor va onboarding tugagan holda /kirish ga kirsa → /ish ga
- Public sahifalar (/, /kirish) himoyalanmaydi
- next-intl middleware bilan to'g'ri birlashsin (locale prefiksi buzilmasin)

### 6. Testlar (vitest)
- Telegram hash tekshiruvi: to'g'ri payload o'tadi
- Buzilgan hash rad etiladi
- 5 daqiqadan eski auth_date rad etiladi
- Onboarding holati aniqlash mantiqi
- Mavjud 24 ta test buzilmasin

## Qilma
- LLM chaqiruvi, generator, kredit yechish — YO'Q
- To'lov ekranlari — YO'Q
- SMS/email auth — YO'Q, faqat Telegram
- Foydalanuvchi rasmini saqlash — YO'Q (R2 hali sozlanmagan)
- Yangi npm paket — faqat zarur bo'lsa va sababini aytib

## Qabul mezonlari
- [ ] pnpm typecheck / lint / test / build — 0 xato
- [ ] Vercel preview'da Telegram orqali kirish ishlaydi
- [ ] Lokalda DEV_LOGIN_ENABLED=true bilan kirish ishlaydi
- [ ] Kirmagan foydalanuvchi /ish ga kirolmaydi
- [ ] Onboarding ma'lumotlari bazaga yoziladi va qayta kirganda so'ralmaydi
- [ ] Uchala tilda ham oqim to'liq ishlaydi
- [ ] Bot tokeni hech qayerda log qilinmagan

## Ish tartibi
1. Avval Auth.js masalasi bo'yicha qaroringni ayt, tasdiqlashimni kut
2. `feat/auth` branch'ida ishla
3. Migratsiya kerak bo'lsa `pnpm db:migrate` ni o'zing ishlat
4. Oxirida: o'zgargan fayllar + men qo'lda qilishim kerak bo'lgan ishlar ro'yxati
5. PR och