# 03 — Telegram bot deep-link login va webhook

## Muammo

Login Widget (`/uz/kirish`) brauzerda telefon raqami so'raydi va tasdiqni
Telegram'ning **xizmat chatiga** (777000 — "Telegram" nomli chat) yuboradi,
bot chatiga emas. Foydalanuvchi o'sha xabarni topmasa yoki kutish oynasini
yopib qo'ysa — kirish yakunlanmaydi.

Ikkinchi, mustaqil kamchilik: **bot `/start` ga umuman javob bermasdi.**
`getWebhookInfo` bo'sh (`url: ""`) edi va repoda bot yangiliklarini
qabul qiladigan hech qanday route yo'q edi.

Diagnostika paytida tasdiqlangan: token, `bot_id` (8902135838) va
`TELEGRAM_BOT_USERNAME` (`EduDastBot`) bir-biriga to'liq mos, BotFather'da
domen ham qadalgan. Ya'ni muammo sozlamada emas, oqimda edi.

## Yechim: deep-link login

```
brauzer                          Telegram                    server
   │  POST /api/auth/telegram/boshlash ──────────────────────▶ LoginToken
   │  ◀── { deepLink }  +  httpOnly cookie "code.verifier"
   │
   │  t.me/EduDastBot?start=<code> ──▶ "Start" ──▶ POST /api/telegram/webhook
   │                                               (secret_token tekshiriladi)
   │                                               upsert User, approvedAt
   │
   │  GET /api/auth/telegram/holat  (har 2 s) ────────────────▶ tayyor?
   │  ◀── { holat: "tayyor", manzil } + sessiya cookie'si
   └─ location.replace(manzil)
```

Telefon raqami ham, SMS ham, xizmat chatidagi tasdiq xabari ham kerak emas.
Sessiya foydalanuvchi login boshlagan **o'sha brauzerda** ochiladi —
Telegram'ning ichki brauzerida emas.

### Nega ikkita sir

`code` deep-link ichida Telegram orqali o'tadi, ya'ni foydalanuvchi uni
ko'radi va forward ham qilishi mumkin. Shuning uchun u yolg'iz o'zi
sessiya bera olmaydi: holat so'rovi `verifier` ni ham talab qiladi, u esa
faqat login boshlangan brauzerdagi httpOnly cookie'da (bazada — SHA-256).

### Bir martalik

`consumedAt` `updateMany({ where: { consumedAt: null } })` bilan atomar
qo'yiladi, `approvedAt` ham xuddi shunday. Ya'ni ikkita parallel so'rov
bitta tokendan ikkita sessiya yasay olmaydi va "Start" ni ikki marta
bosish ikkinchi sessiyani ochmaydi.

## Widget qayerda qoldi

Kirish sahifasida **zaxira** yo'l sifatida. Kompyuterda Telegram ilovasi
o'rnatilmagan bo'lsa deep-link ochilmaydi — o'shanda widget kerak bo'ladi.
`/api/auth/telegram/[locale]` callback'i o'zgarmadi, faqat foydalanuvchi
`upsert`i `lib/auth/upsert-telegram-user.ts` ga ko'chirildi (webhook bilan
bir xil bo'lishi uchun).

## Sozlash (bir martalik)

1. Sir yarating: `openssl rand -hex 32`.
2. `.env.local` ga `TELEGRAM_WEBHOOK_SECRET` qo'shing.
3. **Vercel → Settings → Environment Variables** ga AYNAN shu qiymatni
   `TELEGRAM_WEBHOOK_SECRET` nomi bilan qo'shing (Production + Preview).
4. Deploy qiling.
5. Webhook'ni qadang:

   ```
   pnpm tg:webhook https://edudast.vercel.app
   ```

   Tekshirish: `pnpm tg:webhook` (parametrsiz) — `getWebhookInfo` chiqadi,
   `url` to'ldirilgan va `last_error_message` bo'sh bo'lishi kerak.

Sir Vercel'da yo'q bo'lsa webhook **ataylab** 503 qaytaradi — "sirsiz
ishlayveradi" rejimi yo'q.

## Yo'l-yo'lakay tuzatilgan: Vercel build'i keshda yiqilardi

Preview deploy `Module not found: Can't resolve './generated/prisma/client'`
bilan yiqildi. Sabab bu sessiyaning kodida emas:

```
Installing dependencies...
Already up to date
Done in 47ms
```

Vercel oldingi deploydan build keshini tiklaganda pnpm o'rnatishni butunlay
o'tkazib yuboradi — ya'ni `postinstall: prisma generate` ISHGA TUSHMAYDI.
`lib/generated/` esa `.gitignore` da, demak repoda ham yo'q. Natijada
`lib/db.ts` import qiladigan client umuman mavjud bo'lmaydi.

Yechim: generatsiya `postinstall` ga emas, `build` ga bog'landi —

```json
"build": "prisma generate && next build"
```

`postinstall` joyida qoldi (lokalda `pnpm install` dan keyin client darhol
kerak). Bu ikkalasi bir-birini takrorlaydi, lekin `prisma generate`
idempotent va ~250 ms — keshdan kelib chiqadigan jimgina sinishdan ancha arzon.

## Ochiq qolgan ish

- Muddati o'tgan `LoginToken` qatorlarini davriy tozalash (hozircha
  qatorlar qoladi; `@@index([expiresAt])` shu uchun qo'yilgan). Qator
  soni sezilarli bo'lganda cron kerak bo'ladi.
- Botning `/start` dan boshqa buyruqlari (yordam, obuna holati) — keyingi
  sessiyalarda. Hozir webhook faqat `message` yangiliklarini so'raydi.
