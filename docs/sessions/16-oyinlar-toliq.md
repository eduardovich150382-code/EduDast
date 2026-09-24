# 16-sessiya — Qolgan 7 o'yin

Kontekst: o'yinlar poydevori va uchta o'yin ishlaydi (15-sessiya).
Bu sessiyada reyestrga qolgan o'yinlar qo'shiladi.

**Qoida: har o'yin = bitta fayl + reyestrga bitta qator + bitta test.**
Agar biror o'yin uchun poydevorni o'zgartirish kerak bo'lsa — to'xta va
menga ayt, arxitekturada xato bor.

## Bajariladigan ish

### 1. `lib/games/crossword.ts` — Krossvord
Backtracking bilan panjara joylash.
**Xavf: bu hisoblash jihatidan og'ir masala.** Qat'iy 200 ms vaqt
chegarasi va "joylashmagan so'zlarni tashlab yuborish" strategiyasi kerak,
aks holda serverless funksiya osilib qoladi.
Doska: katakni bosib javob kiritish, to'g'ri bo'lsa yashil.
Varaq: panjara + savollar (gorizontal/vertikal), kalit alohida sahifada.
**Test: kesishgan harflar mos kelishi** — bu asosiy invariant.

### 2. `lib/games/matching.ts` — Moslashtirish (juftlash)
Chap ustun — atama, o'ng ustun — ta'rif, aralashtirilgan (seeded).
Doska: chapdan bittasini, o'ngdan bittasini bosish; to'g'ri juft yashil.
Varaq: ikki ustun + bog'lash uchun chiziq joyi.

### 3. `lib/games/quiz.ts` — Viktorina
**Tayyor testning `question` bloklaridan qo'shimcha AI chaqiruvisiz**
kelib chiqadi. Savollarni seeded tartiblash.
Doska: savol katta harflarda, 4 variant katta tugmalar, javobdan keyin
to'g'risi yashil, BALL.
Varaq: savollar + variantlar, kalit alohida.

### 4. `lib/games/cloze.ts` — Bo'shliqni to'ldirish
Matndan kalit so'zlarni olib tashlash (seeded tanlov).
Doska: bo'sh katakni bosib so'zlar ro'yxatidan tanlash.
Varaq: matn bo'shliqlar bilan + so'zlar banki.

### 5. `lib/games/true-false.ts` — To'g'ri / noto'g'ri
Tasdiqlar ro'yxati. To'g'ri/noto'g'ri nisbati 30–70 % oralig'ida bo'lsin.
Doska: bitta tasdiq, ikkita katta tugma.
Varaq: ro'yxat + belgilash ustuni.

### 6. `lib/games/memory.ts` — Xotira kartalari
Juftlar (atama–ta'rif yoki atama–rasm), seeded joylashuv.
Doska: yopiq kartalar to'ri, bosilganda ochiladi, juft topilsa qoladi.
Varaq yo'q.

### 7. `lib/games/bingo.ts` — Bingo
Har varaqqa **turli** kartochka (seeded, varaq raqamiga bog'liq).
Doska: chaqiruvchi rejimi — tasodifiy atama chiqadi, chiqqanlar ro'yxati.
Varaq: 5×5 kartochka, har o'quvchiga boshqacha.

### 8. Testlar
Har o'yin uchun 15-sessiyadagi standart: determinizm, vaqt chegarasi,
turga xos invariant. Qo'shimcha:
- Krossvord: kesishgan harflar mos; vaqt chegarasidan oshmaydi;
  joylashmagan so'z bo'lsa hisobotda ko'rinadi
- Bingo: 30 ta kartochka orasida ikkita bir xil yo'q
- Viktorina/cloze/true-false: mavjud `question` bloklaridan to'g'ri o'qiydi
- `games-registry.test.ts` endi 10 ta `kind` ni qamrab oladi

### 9. i18n
`Games` namespace'iga yangi kalitlar, **uchala** faylda.

## Qilma
- Poydevorni o'zgartirish — YO'Q (kerak bo'lsa to'xta va ayt)
- Yangi npm paket — YO'Q
- Rasm generatsiyasi (memory uchun) — YO'Q, faqat matn

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] O'nta o'yinning hammasi smart doskada barmoq bilan ishlaydi
- [ ] Varaq beradigan o'yinlar A4 da toza chiqadi, kalit alohida sahifada
- [ ] Krossvord 200 ms ichida quriladi, kesishgan harflar to'g'ri
- [ ] Bitta testdan viktorina, bo'shliq va to'g'ri/noto'g'ri
      qo'shimcha AI chaqiruvisiz yasaladi
- [ ] Bingo kartochkalari bir-biridan farq qiladi

## Ish tartibi
1. `feat/oyinlar-toliq` branch'ida ishla
2. Krossvorddan boshla — eng qiyini, vaqt yetmasa qolganlari soddaroq
3. Har o'yin uchun qancha qator kod yozilganini ayt — 150 qatordan
   oshsa arxitekturani qayta ko'ramiz
4. PR och
