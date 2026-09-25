# Sessiyalar

Har fayl — bitta bosqich uchun to'liq topshiriq. Tartib bilan bajariladi,
har biri alohida branch va alohida PR.

**Ishlatish:** faylni ochib, butun matnini nusxa olib, vibe coding'ga
beriladi. Har topshiriqning oxirida "Qabul mezonlari" bor — shu ro'yxat
to'liq bajarilmaguncha PR ochilmaydi.

Har bosqich oxirida majburiy:
```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

| # | Fayl | Nima quriladi | Natija |
|---|---|---|---|
| 01 | `01-poydevor.md` | ✅ bajarilgan | Next.js, tokenlar, i18n, Prisma sxemasi |
| 02 | `02-auth.md` | ✅ bajarilgan | Telegram login, onboarding |
| 03 | `03-telegram-bot-login.md` | ✅ bajarilgan | Deep-link login, webhook |
| 04 | `04-llm-qatlami.md` | ✅ bajarilgan (PR #8) | AI qatlami: Claude + Gemini, narx, byudjet, A/B |
| 05 | `05-embedding.md` | Mavzularni indekslash | Ma'no bo'yicha qidiruv ishlaydi |
| 06 | `06-kreditlar.md` | Band qilish / yechish / qaytarish | Admin kredit bera oladi |
| 07 | `07-kalendar-va-tmr.md` | O'quv yili, choraklar, hafta hisobi | "Rejam" sahifasi |
| 08 | `08-dars-ishlanma.md` | Generatsiya konveyeri | **Birinchi haqiqiy dars ishlanma** |
| 09 | `09-dars-jadvali.md` | Sinflar, jadval, haftalik bosh sahifa | Sayt ertangi darsni o'zi biladi |
| 10 | `10-test-generatsiya.md` | Test | Ikkinchi material turi |
| 11 | `11-interfeys.md` | Sehrgar, ro'yxat, tungi rejim | To'liq foydalanish mumkin |
| 12 | `12-eslatmalar.md` | Sayt + bot eslatmalari | Platforma o'zi eslatadi |
| 13 | `13-muharrir.md` | Blok muharriri | Tuzatish mumkin |
| 14 | `14-taqdimot.md` | Slaydlar, brauzer pleyeri | Smart doskaga tayyor |
| 15 | `15-oyinlar-poydevori.md` | O'yin arxitekturasi + 3 o'yin | Birinchi o'yin |
| 16 | `16-oyinlar-toliq.md` | Qolgan 7 o'yin | To'liq to'plam |
| 17 | `17-eksport.md` | PPTX, DOCX, ulashish | Yuklab olish |
| 18 | `18-tolov.md` | Qo'lda karta to'lovi | Daromad |

04-bosqichda kod tugallangan; kalit va bazaga ulanish talab qiladigan
tekshiruvlar (`pnpm llm:models`, `pnpm llm:smoke`, migratsiya) PR #8
tavsifidagi ro'yxatda — ularni kalit egasi bajaradi.

To'liq tahlil va sabablar: [`docs/reja.md`](../reja.md)

## Muhim chiziqlar

- **04–09 bosqich** (≈3–4 hafta) — birinchi real o'qituvchilar haqiqiy dars
  ishlanma olishadi va bosh sahifa ularning jadvalini biladi
- **10–12** (≈1,5–2 hafta) — kundalik asbobga aylanadi
- **13–18** (≈3 hafta) — muharrir, taqdimot, o'yinlar, eksport, to'lov

Muddat siqilsa 16-bosqichni (qolgan 7 o'yin) surish eng arzon qurbonlik —
har o'yin mustaqil fayl.

## Har PR uchun ro'yxat

- [ ] Har yangi server action'ga vitest fayli (CLAUDE.md 8-qoida)
- [ ] Yangi UI matnlari `uz`, `uz-Cyrl`, `ru` — uchalasida
- [ ] Hech qayerda hardcode rang yo'q (`components/games/**` dan tashqari,
      15-bosqichdan keyin)
- [ ] Har LLM chaqiruvida `costUsd`, `tokensIn`, `tokensOut`, `model` yozilgan
- [ ] `.env.example` yangilangan
- [ ] Migratsiya fayli commit qilingan
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` yashil
