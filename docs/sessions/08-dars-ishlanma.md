# 08-sessiya — Dars ishlanma generatsiyasi

Kontekst: AI qatlami, embedding, kredit va taqvim-mavzu reja tayyor.
Bu **eng muhim sessiya** — birinchi marta haqiqiy material yaratiladi va
kredit yechiladi. Hamma keyingi hujjat turlari shu konveyerni qayta ishlatadi.

## Bajariladigan ish

### 1. `lib/documents/blocks.ts` — kontent shartnomasi

`DocumentContent = { v: 1, blocks: Block[] }`, Zod discriminated union.
Har blokda `id: string` va `type`.

Bloklar: `heading`, `paragraph`, `list` (ordered|bullet), `table`,
`objectives`, `materials`, `stages`, `question`, `answerKey`, `rubric`,
`homework`, `note`.

`stages` bloki: `{ title, minutes, teacherActions[], studentActions[] }[]`.
`question` bloki: `{ kind: "mcq"|"short"|"truefalse"|"match", text,
options[], answer, points, bloom }`.

**Markdown YO'Q** — CLAUDE.md "Qilma". Matn — sof satr, formatlash blok
turi orqali.

`lib/documents/render.ts` — bloklardan sof matn yasaydigan YAGONA joy
(eksport, sifat tekshiruvi, qidiruv shu orqali).

### 2. `lib/documents/lifecycle.ts`
`claimStage`, `markDone`, `markFailed` — atomar o'tishlar.
`claimStage`: `Document.updateMany({ where:{ id, userId,
status:{in:["QUEUED","RUNNING"]} }, data:{ status:"RUNNING", startedAt } })`,
`count === 1` yagona ishchini kafolatlaydi.

Noqonuniy o'tishlar rad etilsin: `DONE → RUNNING`, ikkinchi `claimStage`,
`FAILED` hujjat ustidan `charge`.

### 3. `lib/generation/plans.ts` — bosqich rejasi
`LESSON_PLAN` uchun 3 bosqich:
1. Skelet — sarlavha, maqsadlar, materiallar, bosqich nomlari + daqiqa byudjeti
2. Bosqichlar mazmuni — har bosqich uchun o'qituvchi va o'quvchi harakatlari
3. Uy vazifasi + baholash + differensiatsiya izohlari

1-bosqich natijasi 2 va 3 ga kontekst sifatida uzatiladi.

### 4. `lib/generation/retrieval.ts`
`buildTopicContext(topicId)`:
- `Topic` qatori (maqsadlar, kalit so'zlar, `hoursPlan`) + ota zanjiri +
  qardosh mavzular sarlavhalari — oddiy Prisma
- `embedQuery(title + objectives)` → `findSimilarChunks(vec, {topicId, limit: 8})`
- `findSimilarTopics(vec, {subjectId, grade, limit: 5})` — o'zini chiqarib tashlab

**Deterministik satr qaytarsin** — saralangan, vaqt tamg'asisiz,
foydalanuvchi ma'lumotisiz. Sabab: bu prompt keshining chegarasi. Ikki
chaqiruv bir xil satr bermasa kesh ishlamaydi va narx 10 barobar oshadi.

10 daqiqalik xotira keshi (`topicId` bo'yicha) qo'sh.

### 5. Prompt tuzilishi (kesh uchun)
1. Muzlatilgan pedagogik ko'rsatma + blok sxemasi tavsifi — `cacheable`
2. `buildTopicContext` natijasi — `cacheable`
3. O'qituvchiga xos parametrlar (sinf, davomiylik, til) — **kesh
   chegarasidan keyin**

### 6. Server action va route'lar
```
server/generation-actions.ts            boshlaGeneratsiya
app/api/generate/[id]/bosqich/route.ts  POST: ANIQ bitta bosqich
app/api/generate/[id]/holat/route.ts    GET: holat + tayyor bloklar
app/api/cron/stale-documents/route.ts   RUNNING > 15 daq -> FAILED + release
```

`boshlaGeneratsiya`: `requireAuth()` → Zod → `checkBudget` →
`$transaction[ hold(cost), Document.create(QUEUED) ]` → `{documentId}`.

Bosqich route'i: `claimStage` → **bitta** `runLlm` → bloklarni `contentJson`
ga qo'shish + kursorni surish (`inputParams.progress = {stage, total}`) —
bitta qisqa tranzaksiyada. Oxirgi bosqichda sifat bahosi → o'tsa `charge` +
`DONE`, o'tmasa `release` + `FAILED`.

`export const maxDuration = 60`, `export const runtime = "nodejs"`.
Analitika va admin xabari `after()` ichida.

**Nega bitta uzun SSE emas:** Vercel Hobby'da funksiya 60 soniyadan uzun
ishlamaydi; har bosqich mustaqil qayta urinuvchan; uzilgan mobil ulanish
ko'pi bilan bitta bosqichni yo'qotadi; progress bazadagi haqiqiy holat.

### 7. `lib/generation/quality.ts` — AI'siz sifat bahosi
- Strukturaviy: kerakli bloklar bor; `stages` daqiqalari so'ralgan
  davomiylikning ±10 % ichida; `mcq` da ≥3 turli variant va aniq bitta to'g'ri
- Kurikulum qamrovi: `Topic.objectives` kalit so'zlarining matnda uchrash ulushi
- Til: lotin so'ralganda kirill belgilar ulushi chegaradan past; markdown
  artefaktlari (`**`, `##`, qator boshidagi `- `) yo'q
- Uzunlik: blok turiga qarab

Vaznli yig'indi → `qualityScore` (0–1), tafsilot → `qualityNotes`.
`< 0.5` → `FAILED` + release. `0.5–0.7` → `DONE` + ogohlantirish.

### 8. Minimal ko'ruvchi (tahrirsiz)
`app/[locale]/ish/hujjat/[id]/page.tsx` — bloklarni o'qishga qulay qilib
chiqaradi. `RUNNING` bo'lsa tayyor bloklar + qolganlariga skelet.
Tahrirlash YO'Q (13-sessiya).

Oddiy yaratish formasi: fan → sinf → chorak → mavzu (07-sessiyadagi
"Rejam" ma'lumotidan) → davomiylik. To'liq sehrgar 11-sessiyada.

`app/[locale]/ish/error.tsx` va `.../hujjat/[id]/loading.tsx` ham shu yerda.

### 9. i18n
`Generator`, `Documents` namespace'lari, **uchala** faylda.
Generatsiya natijasi (hujjat matni) o'zbek lotinda — bu foydalanuvchi
ma'lumoti, tarjima qilinmaydi.

### 10. Testlar
- `generation-actions` — 8-qoida: `requireAuth` Zod'dan oldin; noto'g'ri
  mavzu rad etiladi; kredit yetmasa `Document` yaratilmaydi; hold va create
  bitta tranzaksiya (ikkinchisini rad et, hech narsa qolmasin)
- `documents-blocks` — sxema round-trip, noma'lum blok rad etiladi, `v` mos emas
- `documents-lifecycle` — har noqonuniy o'tish
- `generation-quality` — `fixtures/documents/` da 4 ta namuna: yaxshi,
  daqiqalari qochgan, rus tili aralashgan, javob kaliti yo'q
- `generation-retrieval` — bir xil kirishda kontekst satri **bir xil**
  (kesh kafolati)
- `generation-stage-route` — fake provayder: parallel POST kursorni ikki
  marta surmaydi

## Qilma
- Tahrirlash, sehrgar, o'yin, taqdimot — YO'Q
- Markdown saqlash — YO'Q
- LLM chaqiruvini kredit tranzaksiyasi ichiga o'rash — YO'Q
- 60 soniyadan uzun ishlaydigan route — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] Vercel preview'da telefondan dars ishlanma yaratiladi
- [ ] `Document.status` `DONE`, aniq bitta `CreditTx`, `creditsHeld` 0 ga qaytgan
- [ ] `qualityScore` va `qualityNotes` to'ldirilgan
- [ ] AI kalitini ataylab buzsang → `FAILED`, kredit qaytgan, `CreditTx` yo'q
- [ ] Brauzerni o'rtada yopib qayta ochsang — o'sha joydan davom etadi
- [ ] Ikkinchi o'qituvchi o'sha mavzudan yaratsa `LlmCall` da kesh o'qish ko'rinadi

## Ish tartibi
1. `feat/dars-ishlanma` branch'ida ishla
2. Avval `blocks.ts` va `quality.ts` ni testlari bilan yoz, keyin konveyer
3. Birinchi haqiqiy natijani menga ko'rsat (matni bilan)
4. Bitta hujjatning narxini (`LlmCall` yig'indisi) ayt — kredit narxini
   shunga qarab belgilaymiz
5. PR och
