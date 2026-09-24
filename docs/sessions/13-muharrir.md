# 13-sessiya — Hujjat muharriri

Kontekst: generatsiya, interfeys va eslatmalar tayyor. AI 90 % ni to'g'ri
qiladi; qolgan 10 % ni o'qituvchi tuzata olmasa — bu demo, asbob emas.

**Ogohlantirish:** bu sessiya jadvalni buzadigan eng ehtimolli joy.
Hajmni qat'iy ushla.

## Bajariladigan ish

### 1. Blokli muharrir (rich text EMAS)
```
components/editor/document-editor.tsx
components/editor/block-shell.tsx
components/editor/add-block-menu.tsx
components/editor/blocks/*.tsx        har blok turiga bittadan
```

Blokka tegilganda u fokuslangan kartaga aylanadi. **Tipli maydonlar
alohida:** `stages` bloki sarlavha, daqiqa, o'qituvchi harakatlari va
o'quvchi harakatlarini **alohida maydonlarda** tahrirlaydi, bitta katta
matn sifatida EMAS. `question` bloki savol matni, variantlar, to'g'ri javob
va ballni alohida oladi.

### 2. v1 ga kiradigan amallar — shu ro'yxatdan oshma
- Matn maydonlarini tahrirlash
- Blokni o'chirish
- Yuqoriga / pastga ko'chirish (tugmalar bilan)
- Nusxalash
- Yangi blok qo'shish

**KIRMAYDI:** sudrab tashlash (drag), orqaga qaytarish (undo), birgalikda
tahrirlash, versiyalar tarixi, bitta blokni AI bilan qayta yozish.

### 3. Avtosaqlash
1.5 soniya kutish (debounce) → `saveDocument` server action.
`requireAuth()` → butun `DocumentContent` ni Zod bilan parse →
`updateMany({ where:{ id, userId, deletedAt: null } })`.

`useOptimistic` bilan darhol ko'rsat. Saqlanmasa — sonner toast, lokal
holat saqlanib qolsin (yozgan matn yo'qolmasin).

Saqlanmagan o'zgarish bo'lsa sahifadan chiqishda ogohlantir
(`beforeunload`).

### 4. Boshqa amallar
`server/document-actions.ts`:
- `saveDocument` — yuqoridagidek
- `renameDocument`
- `deleteDocument` — **soft delete** (`deletedAt`), hard delete YO'Q
  (CLAUDE.md, baza qoidalari)

Har birida `requireAuth()` BIRINCHI, keyin Zod, va `where` ichida
`userId` — boshqa o'qituvchining hujjatini tahrirlab bo'lmasin.

### 5. Mobil
Blok amallari pastki varaqda (`sheet`). Teginish nishonlari ≥44 px.
Klaviatura ochilganda faol blok ko'rinib tursin.

### 6. i18n
`Editor` namespace, **uchala** faylda.

### 7. Testlar
- `document-actions` — 8-qoida har uchala amal uchun: auth birinchi;
  noma'lum blok turi rad etiladi; **boshqa foydalanuvchining hujjatini
  saqlab bo'lmaydi** (`where` da `userId` borligini tasdiqla);
  `deleteDocument` hard delete qilmaydi
- `documents-blocks` — muharrir yozadigan shakl sxemaga mos

## Qilma
- Drag-and-drop, undo, birgalikda tahrirlash, versiyalar — YO'Q
- Rich text muharrir kutubxonasi (TipTap, Slate va h.k.) — YO'Q
- Blokni AI bilan qayta yozish — YO'Q (alohida kredit oqimi kerak,
  keyingi bosqich)

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Telefonda dars ishlanmaning matnini tahrirlab, sahifani yangilasang
      o'zgarish saqlangan
- [ ] Internetni uzib matn yozsang — toast chiqadi, yozgan matn yo'qolmaydi
- [ ] Boshqa akkaunt hujjatini tahrirlash urinishi rad etiladi
- [ ] O'chirilgan hujjat bazada qoladi (`deletedAt`)

## Ish tartibi
1. `feat/muharrir` branch'ida ishla
2. Hajm ro'yxatidan chiqma — qo'shimcha g'oya bo'lsa menga ayt, o'zing qo'shma
3. PR och
