# 15-sessiya — O'yinlar poydevori va dastlabki 3 o'yin

Kontekst: generatsiya, muharrir, taqdimot tayyor. Bu sessiyada o'yinlar
arxitekturasi quriladi va skrinshotlarda ko'rsatilgan uchta o'yin ishlaydi.

**Maqsadli qurilma — smart doska.** Bitta katta teginishli ekran,
o'quvchilarda qurilma yo'q. Real vaqtda ulanish, `joinCode`, WebSocket —
**kerak emas**. `GameSession`/`GamePlayer` modellari sxemada qoladi
(kelajakda jonli rejim uchun), lekin ishlatilmaydi.

## Bajariladigan ish

### 1. CLAUDE.md o'zgarishi (kelishilgan)
CLAUDE.md ga istisno qo'sh:

> **Istisno (o'yinlar):** `components/games/**` — emoji va erkin ranglar
> ruxsat etiladi. Sabab: smart doskadagi o'yin bolalar uchun bayramona
> ko'rinishi kerak, "issiq qog'oz" palitrasi bu vazifani bajarmaydi.
> Qolgan barcha joyda 2 va 10-qoidalar kuchida.

**`tests/tokens-guard.test.ts` ga `components/games/` uchun allowlist
qo'sh** — aks holda birinchi PR CI'da yiqiladi. Allowlist FAQAT shu
papkani qamrasin.

*Tavsiya (majburiy emas): ikonkalarda emoji o'rniga lucide ishlatilsa,
Android/Windows/iOS smart doskalarida bir xil chiqadi — emoji har
platformada turlicha ko'rinadi, ba'zilarida umuman chiqmaydi.*

### 2. Migratsiya `game_document_type`
`DocumentType` enum'iga `GAME` qo'shiladi. Mavjud `CROSSWORD` qiymatiga
sxemada izoh: `/// Eskirgan — GAME + kind:"crossword" ishlating`.

### 3. Uch qatlamli arxitektura

**Qatlam 1 — mazmun (AI).** O'yinga xos kichik Zod sxemasi: so'z–ta'rif
juftliklari, savol–javob. `cheap` daraja yetarli.

**Qatlam 2 — qurilish (sof algoritm).** `lib/games/*.ts`. LLM'siz.
**AI'dan panjara so'rama** — model kesishgan harflarni deyarli hech qachon
to'g'ri qilmaydi va natijani tekshirib bo'lmaydi.

**Qatlam 3 — ko'rsatish.** Ikkita pleyer:
- `components/games/board/*.tsx` — smart doska: to'liq ekran, katta
  teginish nishonlari (≥60 px, barmoq uchun), BALL hisoblagichi, klaviatura ham
- `components/games/print/*.tsx` — A4, `@media print`, javoblar kaliti
  **alohida sahifada**

### 4. Reyestr
```
lib/games/types.ts       GameKind, GameContent, BuiltGame
lib/games/registry.ts    kind -> { contentSchema, build, board, print, creditCost }
```
`build(content, seed)` → tayyor o'yin ma'lumoti.

**`seed`** `documentId` dan olinadi. Bitta urug' — har doim bitta natija.
Bu uch narsani beradi: test determinizmi, "qayta aralashtirish" tugmasi,
va **"4-variant"** (bir mavzudan bir necha xil varaq — o'quvchilar
ko'chira olmaydi). `?variant=N` bilan boshqa urug'.

`game` bloki `lib/documents/blocks.ts` ga: `{ id, type:"game", kind,
content, seed }`.

### 5. Dastlabki uchta o'yin

**`lib/games/wheel.ts` — Omad g'ildiragi**
8 sektor, har sektorda kategoriya va savol. Aylantirish seeded.
Doska: SVG g'ildirak, CSS animatsiya, to'xtaganda savol katta harflarda
chiqadi, javobni ochish tugmasi. Varaq yo'q.

**`lib/games/word-search.ts` — So'z qidirish**
12×12 panjara. So'zlar 8 yo'nalishda joylashadi, qolgan kataklar tasodifiy
harflar bilan to'ldiriladi (seeded).
Doska: **so'zning birinchi va oxirgi harfini ketma-ket bosish** (skrinshotdagi
mexanika — smart doskada barmoq bilan ishlaydi). Topilgan so'z yashil
bo'ladi, BALL oshadi.
Varaq: panjara + so'zlar ro'yxati ustunlarda.

**`lib/games/anagram.ts` — Anagramma**
Har savolga ta'rif va aralashtirilgan harflar (seeded).
Doska: harf plitkalari, bo'sh kataklar, "Tekshirish" / "Tozalash" /
"O'tkazish" tugmalari, "Savol 1/10", BALL.
Varaq: ta'rif + aralashtirilgan harflar + bo'sh chiziqlar.

### 6. Sahifalar
```
app/[locale]/ish/hujjat/[id]/oyin/page.tsx     doska rejimi (to'liq ekran)
app/[locale]/ish/hujjat/[id]/varaq/page.tsx    chop etiladigan ko'rinish
```
Ikkalasi ham server komponentida render qilinsin — **internet uzilsa ham
o'yin davom etsin**.

### 7. Kredit narxi
`cost-table.ts` ga `GAME` yozuvi, `kind` ga qarab.

### 8. Testlar
Har o'yin uchun:
- Qurilish deterministik: bir seed → bir natija, boshqa seed → boshqa natija
- **So'z qidirish:** har so'z panjarada haqiqatan topiladi (algoritm bilan
  qidirib tasdiqla); panjara 12×12; ortiqcha bo'sh katak yo'q
- **Anagramma:** natija asl so'zga teng emas; barcha harflar saqlangan
- **G'ildirak:** 8 sektor, kategoriyalar takrorlanmaydi
- Vaqt chegarasi: hech bir algoritm 200 ms dan oshmaydi va cheksiz halqaga
  tushmaydi

`games-registry.test.ts` — har `kind` uchun sxema, `build`, ikkala pleyer
va kredit narxi borligini tekshiradi. Yarim qo'shilgan o'yin CI'ni yiqitsin.

### 9. i18n
`Games` namespace, **uchala** faylda. (O'yin mazmuni — foydalanuvchi
ma'lumoti, tarjima qilinmaydi; faqat interfeys matnlari.)

## Qilma
- Real vaqtda ulanish, `joinCode`, o'quvchi qurilmasi — YO'Q
- AI'dan panjara yoki joylashuv so'rash — YO'Q
- O'yin istisnosini `components/games/` dan tashqariga chiqarish — YO'Q
- Qolgan 7 o'yin — YO'Q (16-sessiya)

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Uchala o'yin smart doskada (yoki katta ekranda) **barmoq bilan** ishlaydi
- [ ] So'z qidirish va anagramma A4 varaq sifatida toza chop etiladi
- [ ] Bitta hujjatni ikki marta ochsang natija **bir xil**
- [ ] `?variant=2` boshqa panjara/aralashma beradi
- [ ] `tokens-guard` testi `components/games/` dan tashqarida hali ham qat'iy

## Ish tartibi
1. `feat/oyinlar` branch'ida ishla
2. Avval `registry.ts` va uchta algoritmni testlari bilan yoz, keyin UI
3. Har o'yinning skrinshotini (doska va varaq) ko'rsat
4. PR och
