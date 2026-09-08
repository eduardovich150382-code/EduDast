# Kurikulum CSV formati

Topic (mavzu) daraxti CSV fayldan import qilinadi:

```bash
pnpm curriculum:import <fayl.csv> --subject <fan-slug> [--dry-run]
```

Misol:

```bash
pnpm curriculum:import fixtures/fizika-7-namuna.csv --subject fizika --dry-run
pnpm curriculum:import fixtures/fizika-7-namuna.csv --subject fizika
```

`--subject` — `Subject.slug` (masalan `fizika`, `matematika`). Fan bazada
oldindan bo'lishi kerak (`pnpm db:seed`).

## Ustunlar

Sarlavha qatori MAJBURIY va aynan shu nomlar bilan bo'lishi kerak (tartib
muhim emas, ortiqcha ustun e'tiborsiz qoldiriladi):

| Ustun | Majburiy | Izoh |
|---|---|---|
| `grade` | ha | Sinf, 1–11 |
| `parent_slug` | yo'q | Bo'sh — bo'lim (ildiz tugun). To'ldirilgan — **shu sinfdagi** o'sha slug'ning bolasi |
| `slug` | ha | `^[a-z0-9]+(-[a-z0-9]+)*$` — kichik lotin harflari, raqam, chiziqcha |
| `title_uz` | ha | O'zbekcha (lotin) sarlavha |
| `title_uz_cyrl` | ha | O'zbekcha (kirill) sarlavha |
| `title_ru` | ha | Ruscha sarlavha |
| `order` | ha | Tartib raqami, manfiy emas. Bir xil bo'lsa `slug` bo'yicha saralanadi |
| `objectives` | yo'q | O'quv maqsadlari, `\|` bilan ajratilgan |
| `keywords` | yo'q | Kalit so'zlar, `\|` bilan ajratilgan |
| `hours_plan` | yo'q | Rejadagi soat, 0 dan katta butun son |

Sarlavhada vergul bo'lsa maydonni qo'shtirnoqqa oling:
`"Harorat, termometr"`. Fayl UTF-8 bo'lishi kerak; Excel qo'shadigan BOM
avtomatik olib tashlanadi.

## Namuna

`fixtures/fizika-7-namuna.csv`:

```csv
grade,parent_slug,slug,title_uz,title_uz_cyrl,title_ru,order,objectives,keywords,hours_plan
7,,harakat-va-kuch,Harakat va kuch,Ҳаракат ва куч,Движение и сила,1,,,
7,harakat-va-kuch,mexanik-harakat,Mexanik harakat,Механик ҳаракат,Механическое движение,1,Mexanik harakatni ta'riflaydi|Sanoq sistemasini tanlaydi,harakat|traektoriya|sanoq sistemasi,2
7,harakat-va-kuch,tezlik,Tezlik,Тезлик,Скорость,2,Tezlikni hisoblaydi|Birliklarni almashtiradi,tezlik|masofa|vaqt,2
7,,issiqlik,Issiqlik hodisalari,Иссиқлик ҳодисалари,Тепловые явления,2,,,
7,issiqlik,harorat,"Harorat, termometr","Ҳарорат, термометр","Температура, термометр",1,Termometrdan foydalanadi,harorat|termometr|shkala,1
```

## Xatti-harakat kafolatlari

- **Tranzaksion.** Bitta qatorda xato bo'lsa — bazaga hech narsa
  yozilmaydi. Xatolar bir vaqtda ko'rsatiladi (birinchisida to'xtamaydi):
  `3-qator, "grade" ustuni: 1 dan 11 gacha bo'lishi kerak (topildi: "0")`
- **Idempotent.** Kalit — `(subjectId, grade, slug)`. Faylni ikkinchi marta
  ishlatish dublikat yaratmaydi.
- **Ikki bosqichli.** Avval barcha qatorlar yoziladi, keyin `parent_slug`
  bog'lanadi — ota CSV'da bolasidan keyin tursa ham ishlaydi. Ota bazada
  allaqachon bo'lsa ham bo'ladi (bo'limlarni alohida faylda import qilish
  mumkin).
- **Tiriltirish.** Admin panelidan o'chirilgan (soft delete) mavzu CSV'da
  qayta uchrasa, yangi qator YARATILMAYDI — mavjudi tiklanadi
  (hisobotda `[resurrected]`).
- **`--dry-run`.** Yozuvlar haqiqatda bajariladi, lekin tranzaksiya oxirida
  qaytarib olinadi. Ya'ni hisobot taxmin emas — haqiqiy natija.

## Hisobot

```
Yaratildi: 4 · Tiriltirildi: 0 · Yangilandi: 1 · O'zgarmadi: 0

  [created] 7/harakat-va-kuch  "Harakat va kuch"
  [updated] 7/mexanik-harakat  "Mexanik harakat"

CSV'da yo'q, bazada bor: 1 ta (tegilmadi)
  - 7/kuch-va-massa  "Kuch va massa"
  Kerak bo'lsa /admin/mavzular dan o'chiring.
```

Oxirgi bo'lim — slug tuzatilganda yetim qolgan mavzuni ko'rish uchun. Import
ularni **avtomatik o'chirmaydi**: qaror odamniki, `/admin/mavzular` dan
qo'lda o'chiriladi.

## Ulanish

Skript `lib/db.ts` singleton'ini ISHLATMAYDI — u `DIRECT_URL` (Neon'ning
pooled bo'lmagan manzili) bilan o'z client'ini quradi
(`scripts/script-db.ts`). Sabab: PgBouncer transaction pooling ortida uzun
interaktiv tranzaksiya ishonchli ishlamaydi, import esa aynan shunga
tayanadi. Tranzaksiya `timeout: 120s` bilan ishlaydi (default 5 s — 45+
qatorli faylga yetmaydi).

## Testlar

- `tests/curriculum-csv.test.ts` — validatsiya jadvali (sof, bazasiz)
- `fixtures/fizika-7-buzuq.csv` — qo'lda sinash uchun buzuq fayl
