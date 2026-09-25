# 05-sessiya — Embedding (mavzularni aqlli qidirish)

Kontekst: AI qatlami tayyor (04-sessiya). `lib/curriculum/search.ts` da
pgvector qidiruvi allaqachon yozilgan va HNSW indekslari bor, lekin
`Topic.embedding` va `SourceChunk.embedding` ustunlari **bo'sh** — hech kim
yozmaydi. Shu sessiyada yozuvchini quramiz.

## Bugungi holat (2026-09-25, 04-sessiya yakunlangach)

Bu bo'lim topshiriq yozilgandan KEYIN ma'lum bo'lgan narsalar. Ishni
boshlashdan oldin o'qing — pastdagi ba'zi bandlar shu sababli o'zgaradi.

- **Embedding qatlami qisman bor.** `lib/llm/embeddings.ts` (`embedTexts`,
  `embedQuery`, L2 normallashtirish, `assertDim`) va
  `lib/llm/providers/gemini.ts` dagi `geminiEmbeddings` allaqachon yozilgan.
  Ya'ni pastdagi `lib/llm/embeddings/` papka tuzilishi — noldan qurish emas,
  mavjudini kengaytirish. Fayllarni ko'chirishdan oldin `llm-guard` testini
  hisobga oling: provayder SDK importi faqat `lib/llm/providers/` da bo'lishi
  mumkin.
- **`gemini-embedding-001` jonli tekshirilgan** (`pnpm llm:smoke`,
  2026-09-25): ishlaydi, o'lcham 768, ~450 ms. Ya'ni pgvector ustunlari va
  HNSW indekslari o'zgarmaydi.
- **Yangi `gemini-embedding-2` bor:** matn uchun $0.20/Mtok, multimodal.
  `embedding-001` narxi tasdiqlanmagan ($0.15 "File Search" stavkasidan,
  sahifada alohida qator yo'q). Almashtirish shu sessiyada hal qilinadi;
  o'lcham 768 qolishi shart.
- **Eng muhim saboq:** model `models.list` ro'yxatida turishi uni ishlatib
  bo'ladi degani EMAS. `gemini-2.5-flash-lite` ro'yxatda turib, chaqiruvda
  "no longer available to new users" bilan 404 qaytardi — shuning uchun
  arzon uya `gemini-3.5-flash-lite` ga o'tdi. Model almashtirsangiz
  `pnpm llm:models` yetarli emas, `pnpm llm:smoke` SHART.
- **`pnpm llm:smoke`** endi embedding chaqiruvini ham bajaradi va o'zidan
  oldin `prisma generate` ishlatadi (eskirgan client jim xato beradi).
- **`LlmCall.errorKind`** ustuni qo'shildi: yiqilgan urinish ham yoziladi,
  token noma'lum bo'lsa nol bilan. Backfill xatolari shu yerda ko'rinadi —
  alohida jurnal qurmang.
- **OpenAI zaxirasi hal qilinmagan.** Pastda `text-embedding-3-small`
  zaxira sifatida aytilgan, lekin bu uchinchi provayder va yangi paket
  degani (CLAUDE.md: sababsiz paket qo'shilmaydi). Boshlashdan oldin
  qaror kerak: zaxira kerakmi yoki v1 da faqat Gemini?
- **Migratsiyalar Neon'da:** `llmcall_system_calls`, `llmcall_error_kind`.
  Provayderlararo zaxira (Claude ↔ Gemini) hali sinalmagan — Anthropic
  kaliti yo'q.

## Bajariladigan ish

### 1. Embedding provayderi
Anthropic'da embeddings API yo'q — **Gemini ishlatiladi**:
`gemini-embedding-001`, `outputDimensionality: 768`. Zaxira sifatida
`text-embedding-3-small` (`dimensions: 768`) interfeys ortida tursin.

`768` — majburiy: mavjud `vector(768)` ustunlari va HNSW indekslari
o'zgartirilmaydi. `EMBEDDING_DIM` ni `lib/curriculum/search.ts` dan qayta
eksport qil, yangi konstanta yaratma.

```
lib/llm/embeddings/index.ts    embedTexts / embedQuery
lib/llm/embeddings/gemini.ts
lib/llm/embeddings/openai.ts   (zaxira, env bilan yoqiladi)
```

Interfeys:
```ts
type EmbeddingProvider = {
  id: string;
  model: string;
  dim: 768;
  embed(texts: string[], kind: "document" | "query"):
    Promise<{ vectors: number[][]; usage: Usage }>;
};
```

**Har vektor bazaga tushishdan oldin bizning kodda L2-normallashtiriladi.**
Sabab: cosine indeks, va normallashtirish provayderlar orasidagi magnitude
farqini yo'q qiladi.

### 2. Migratsiya `embedding_provenance`
`Topic` va `SourceChunk` ga:
- `embeddingModel String?`
- `embeddedAt DateTime?`

`Topic` ga `updatedAt DateTime @updatedAt`.

Eskirgan qator sharti:
`embeddedAt IS NULL OR embeddingModel <> $joriy OR embeddedAt < updatedAt`

**`server/admin-actions.ts:updateTopic` har tahrirda `embeddedAt = null`
qo'ysin.** Bu bitta qator, lekin usiz eng yomon nosozlik yuz beradi: sog'lom
ko'rinadigan, jimgina eski matnga javob beradigan qidiruv.

### 3. `lib/curriculum/embed.ts` — yagona yozuvchi
Mavzu matni: `titleUz + "\n" + objectives.join("\n") + "\n" + keywords.join(", ")`.
Yozish `$executeRaw` + `::vector` orqali (Prisma `Unsupported` ustunga tegmaydi).
`lib/curriculum/search.ts` dagi raw SQL ogohlantirish izohini shu faylga ham
ko'chir — `deletedAt IS NULL` filtri QO'LDA yoziladi.

### 4. `scripts/embed-backfill.ts`
`pnpm embed:backfill [--subject fizika] [--grade 7] [--force]`
- Mavjud `createScriptDb()` (DIRECT_URL) dan foydalan, `lib/db.ts` singleton'ini EMAS
- So'rovga 96 ta matn
- **Har partiya alohida commit** — o'rtada yiqilsa ish yo'qolmasin
- Konsolga progress: qancha qoldi, qancha yozildi

### 5. `app/api/cron/embeddings/route.ts`
Vercel Cron, `CRON_SECRET` bearer tekshiruvi (yo'q bo'lsa 503).
Chaqiruviga 200 tagacha eskirgan qator. `vercel.json` ga cron yozuvi.

### 6. `embedQuery()` so'rov yo'lida
Bitta qisqa matn (~80 ms), `purpose: "embed-query"` bilan `LlmCall` ga yoziladi.
**Degradatsiya:** provayder ishlamasa, `Topic.keywords` bo'yicha kalit so'z
qidiruviga tush — RAG yiqilmasin, sifati pasaysin.

### 7. Testlar
- `embeddings-normalize` — L2 normallashtirish; 768 dan boshqa uzunlik rad etiladi; NaN rad etiladi
- `embeddings-staleness` — eskirish shartining 4 holati
- `embeddings-provider` — fake provayder: 97 matn → 2 so'rov; tartib saqlanadi; yarim partiya xatosi indekslarni buzmaydi
- `tests/integration/embeddings-write.test.ts` — Neon test branch: vektor yoziladi, `findSimilarTopics` orqali qaytariladi, `embeddingModel` yozilgan

### 8. `.env.example`
`EMBEDDING_PROVIDER` (`gemini` | `openai`), `OPENAI_API_KEY` (ixtiyoriy),
`CRON_SECRET` — izohlar bilan.

## Qilma
- 768 dan boshqa o'lcham — YO'Q (sxema va indeks migratsiyasini majburlaydi)
- Navbat infratuzilmasi (Redis, queue) — YO'Q. `embeddedAt IS NULL` ning
  o'zi navbat, cron — ishchi
- Generatsiya, UI — YO'Q

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] `pnpm embed:backfill --subject fizika --grade 7` ishlaydi va progress ko'rsatadi
- [ ] Skriptni ikkinchi marta ishlatsang hech narsa qayta yozilmaydi (`--force` siz)
- [ ] Admin panelidan mavzuni tahrirlasang `embeddedAt` null bo'ladi
- [ ] `TEST_DATABASE_URL` bilan integratsiya testi o'tadi
- [ ] Embedding kaliti buzuq bo'lsa qidiruv kalit so'zga tushadi, yiqilmaydi

## Ish tartibi
1. `feat/embedding` branch'ida ishla
2. Migratsiyani o'zing ishlat
3. Fizika 7 ni to'liq backfill qilib, natijani ko'rsat
4. PR och
