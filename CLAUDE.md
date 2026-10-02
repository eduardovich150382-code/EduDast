\# EduDast — loyiha qoidalari



\## Mahsulot

O'zbekiston o'qituvchisi uchun AI ish o'rni. Asosiy qiymat: kurikulumga bog'langan

dars ishlanma, test, taqdimot + sinfda o'ynaladigan o'yin. Foydalanuvchi — maktab

o'qituvchisi, telefondan, o'zbek tilida (lotin va kirill).



\## Stack

\- Next.js 16 App Router, TypeScript strict, React Server Components

\- Prisma + Neon Postgres (pgvector), Tailwind + shadcn/ui

\- Telegram Login + jose sessiya cookie (Auth.js ishlatilmaydi; SMS/email YO'Q)

\- Vercel (Hobby → Pro), Cloudflare R2 (fayllar), Sentry, PostHog

\- Test: vitest (unit) + playwright (e2e)

\- Paket menejeri: pnpm



\## Buzilmas qoidalar

1\. \*\*Hardcode matn yo'q.\*\* Barcha UI matni next-intl orqali: `uz`, `uz-Cyrl`, `ru`.

&#x20;  Yangi matn qo'shsang — uchala faylga ham kalit qo'sh.

&#x20;  \*\*Istisno:\*\* `app/[locale]/admin/**` va `components/admin/**` — admin paneli
&#x20;  faqat o'zbek tilida (lotin), i18n qoidasidan ozod. Dizayn tokenlari qoidasi
&#x20;  (2-qoida) unga ham to'liq amal qiladi.

2\. \*\*Hardcode rang yo'q.\*\* Faqat `styles/tokens.css` dagi CSS o'zgaruvchilari.

&#x20;  `bg-\[#123456]` yoki `text-purple-500` — taqiqlanadi.

3\. \*\*Har LLM chaqiruvida `costUsd`, `tokensIn`, `tokensOut`, `modelUsed` bazaga

&#x20;  yozilishi SHART.\*\* Bu unutilgan PR merge qilinmaydi.

4\. \*\*Kredit faqat generatsiya muvaffaqiyatli tugagach yechiladi.\*\*

&#x20;  Oqim: hold → generatsiya → (muvaffaqiyat) charge / (xato) release.

5\. \*\*Byudjet shifti:\*\* har LLM chaqiruvidan oldin oylik va kunlik xarajat

&#x20;  tekshiriladi. Shift oshsa arzon modelga tushadi yoki xato qaytaradi.

6\. \*\*Server action'lar `"use server"` bilan, har biri Zod bilan validatsiya

&#x20;  qilinadi va `auth()` tekshiruvidan boshlanadi.\*\*

7\. \*\*Migratsiya:\*\* 
- Lokalda: `pnpm db:migrate` (prisma migrate dev). Migratsiya fayli git'ga tushadi.
- Hozircha bitta Neon bazasi ishlatiladi (lokal = prod). Alohida deploy qadami yo'q.
- Beta boshlanganda (real foydalanuvchi paydo bo'lganda) Neon branch'ga bo'linadi
  va prod'ga faqat `prisma migrate deploy` ishlatiladi. `migrate dev` NI
  real ma'lumot turgan bazaga hech qachon ishlatma — u reset so'rashi mumkin.
- Neon SQL Editor'ga qo'lda kirish kerak emas.

&#x20;  Neon orqali. Har migratsiya `prisma/migrations/` da git'da bo'ladi.

8\. \*\*Har yangi server action = yangi vitest testi.\*\* Istisnosiz.

9\. \*\*Sirlar faqat `.env` da.\*\* `.env.example` yangilanib boradi.

10\. \*\*Emoji ikonka sifatida ishlatilmaydi\*\* — faqat `lucide-react`, 1.5px stroke.



\## Kod uslubi

\- Fayl nomi: `kebab-case.ts`, komponent: `PascalCase.tsx`

\- `app/` — sahifalar, `components/` — UI, `lib/` — mantiq, `server/` — actions

\- Server component default; `"use client"` faqat kerak bo'lganda

\- Har funksiya 40 qatordan oshsa — bo'lish haqida o'ylash

\- Commit: conventional commits (`feat:`, `fix:`, `chore:`)



\## Ish tartibi

\- Bitta sessiya = bitta feature. Branch och, kod yoz, test yoz, PR qil.

\- PR tavsifida: nima o'zgardi, qanday test qilindi, qo'lda tekshirish kerak bo'lgan joy.

\- Yangi shox HAR DOIM `git fetch origin` dan keyin `origin/main` dan ochiladi,
&#x20;  lokal `main` dan EMAS. Lokal `main` oldingi sessiya merge bo'lgach eskiradi
&#x20;  va shox oldingi sessiya ustiga qurilib qoladi (ikki marta shunday bo'ldi).

\- `main` ga to'g'ridan-to'g'ri push YO'Q.

\- Har commit O'Z-O'ZICHA yashil bo'lsin, faqat yakuniy daraxt emas. PR'dan oldin:
&#x20;  `git rebase origin/main --exec "pnpm typecheck && pnpm test"`.



\## Ma'lumotlar bazasi qoidalari

\- Pul bilan bog'liq har amal `CreditTx` yoki `PaymentIntent` da iz qoldiradi

\- Hech qachon `delete` — `deletedAt` ishlating (soft delete)

\- Har `@@index` ni sabab bilan qo'sh, ortiqcha indeks Neon 0.5GB ni yeydi



\## Tekshirish tuzoqlari

\- `i18n-usage` skaneri matn darajasida ishlaydi: nomfazani `useTranslations` /
&#x20;  `getTranslations` natijasi tayinlangan O'ZGARUVCHI NOMI bo'yicha bog'laydi.
&#x20;  Bitta faylda ikki nomfaza bo'lsa, har biriga alohida nom ber
&#x20;  (`const tG = useTranslations("Generator")`, `const tD = useTranslations("Documents")`).
&#x20;  Ikkalasi ham `t` bo'lsa, skaner kalitni "yo u, yo bu nomfazada bor" deb qabul
&#x20;  qiladi va noto'g'ri nomfazadagi kalit jimgina o'tib ketadi.

\- Dinamik kalitni (`t(\`features.${x}\`)`) skaner faqat PREFIKS darajasida
&#x20;  tekshiradi. Ya'ni kalitni qayta nomlashni birorta test tutmaydi — uchala
&#x20;  message faylini qo'lda solishtir.

\- `i18n-usage` assimetrik: kodda ishlatilib messages'da yo'q kalit testni yiqitadi,
&#x20;  ishlatilmagan kalit yiqitmaydi. Shuning uchun YANGI kalitni oldinroq commitda
&#x20;  qo'sh, ESKI kalitni esa uni ishlatgan kod o'chgan commitda o'chir — ikkalasini
&#x20;  bitta "rename" commitiga qo'shma.

\- `curl ... | grep "matn"` YOLG'ON IJOBIY beradi: next-intl butun tarjima
&#x20;  daraxtini HTML payload'iga joylaydi, shuning uchun matn ekranda
&#x20;  ko'rinmasa ham grep uni topadi. Ekranda chindan borligini brauzerda yoki
&#x20;  atrofidagi markup bo'yicha tekshir.



\## Qilma

\- Yangi npm paketni sababsiz qo'shma (bundle va xarajat)

\- `any` turini ishlatma

\- Bir sessiyada bir nechta featureni aralashtirma

\- Hujjat generatsiyasini markdown sifatida saqlama — `contentJson` blok-struktura


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
