# 04-sessiya — AI qatlami (Claude + Gemini)

Kontekst: poydevor, auth, onboarding va kurikulum tayyor (PR #1, #3, #5, #6, #7).
Bu sessiyada **birinchi marta** AI xizmatiga ulanamiz. CLAUDE.md qoidalariga
amal qil, ayniqsa 3-qoida (har chaqiruvda xarajat yoziladi) va 5-qoida (byudjet).

Bu sessiyada **UI YOZILMAYDI** va **generatsiya qilinmaydi** — faqat qatlam.

## Bajariladigan ish

### 1. Paketlar
`@anthropic-ai/sdk` va `@google/genai`. Boshqa paket qo'shma.

### 2. `lib/llm/` — yagona eshik

```
lib/llm/index.ts                faqat runLlm, streamLlm, embedTexts eksport qiladi
lib/llm/types.ts                LlmRequest / LlmResult / LlmProvider / Usage / Tier
lib/llm/models.ts               model reyestri
lib/llm/pricing.ts              usage -> costUsd
lib/llm/router.ts               daraja + byudjet hukmi -> model + zaxira zanjiri
lib/llm/experiment.ts           Claude/Gemini taqsimoti
lib/llm/call.ts                 tekshir -> tanla -> chaqir -> yoz
lib/llm/log.ts                  LlmCall ga yozadigan YAGONA joy
lib/llm/errors.ts               xato turlari
lib/llm/structured.ts           Zod <-> JSON Schema
lib/llm/providers/anthropic.ts
lib/llm/providers/gemini.ts
lib/llm/providers/fake.ts       testlar uchun
lib/llm/providers/registry.ts
```

`LlmRequest` shakli:
```ts
type Tier = "cheap" | "mid" | "hard";
type LlmRequest<T> = {
  purpose: string;          // "lesson-plan:stage-2" ko'rinishida
  tier: Tier;
  userId: string | null;    // null = tizim chaqiruvi
  documentId?: string;      // A/B taqsimoti shu hashdan
  system: SystemPart[];     // [{text, cacheable?}] — tartib = kesh prefiksi
  messages: LlmMessage[];
  schema: z.ZodType<T>;     // MAJBURIY — erkin matn yo'li yo'q
  maxOutputTokens?: number;
  effort?: "low" | "medium" | "high";
};
```

`ProviderRequest` — sof ma'lumot, ichida birorta SDK turi bo'lmasin.

**Anthropic adapteri:** `thinking: {type:"adaptive"}` opus/sonnet-5 uchun,
`budget_tokens` haiku-4-5 uchun, `output_config.format` strukturali chiqish
uchun, oxirgi keshlanadigan system qismiga `cache_control:{type:"ephemeral"}`.
Assistant prefill ISHLATMA — joriy modellarda 400 qaytaradi.

**Gemini adapteri:** `responseMimeType: "application/json"` + `responseSchema`,
`systemInstruction`. Kontekst keshi v1 da ishlatilmaydi.

### 3. Model reyestri va narx

Anthropic (million token uchun, 2026-06-24 holatiga):
| daraja | model | kirish | chiqish |
|---|---|---|---|
| hard | `claude-opus-5` | 5.00 | 25.00 |
| mid | `claude-sonnet-5` | 2.00 | 10.00 |
| cheap | `claude-haiku-4-5` | 1.00 | 5.00 |

Kesh yozish ≈ 1.25× kirish, kesh o'qish ≈ 0.10× kirish.

**Gemini model ID'lari va narxlarini Google'ning JONLI hujjatidan tasdiqla** —
xotiradan yozma. Uchta uya kerak: Pro (hard), Flash (cheap/mid), embedding.
Reyestrda `freeTierRpd` maydoni bo'lsin; bepul kvota ichida `costUsd = 0`,
**lekin `LlmCall` qatori baribir yoziladi**.

`costFor(model, usage)` 6 xonali o'nlik **satr** qaytarsin — to'g'ridan
`Decimal(10,6)` ga tushadi. Ustun qiymati uchun JS float ISHLATMA.
Jadval tepasiga "3 oydan eski bo'lsa jonli narxni tekshiring" izohi.

### 4. Marshrutlash va zaxira
- hukm `full` → daraja modeli; `downgrade` → bir pog'ona past; `deny` →
  tarmoqqa chiqmasdan `LlmError("budget")`
- `RateLimitError` → `retry-after` dan keyin bitta qayta urinish, so'ng past
- `overloaded`/5xx → past
- **Bitta provayder butunlay ishlamasa → ikkinchisiga o't**
- `refusal` → qayta urinma
- **Apiga yetib borgan har urinish o'z `LlmCall` qatorini yozadi**

### 5. A/B taqsimoti
`sha256(documentId + purpose)` birinchi bayti juft/toq → Anthropic/Gemini.
Deterministik: bitta hujjatning barcha bosqichlari BITTA provayderda ketsin.
`LLM_AB_ENABLED=false` → hammasi asosiy provayderga.

### 6. Byudjet — `lib/budget/`
```
lib/budget/limits.ts   env -> chegaralar
lib/budget/spend.ts    SUM(costUsd): oylik, kunlik, foydalanuvchi-kunlik
lib/budget/guard.ts    checkBudget() -> full | downgrade | deny
```
Chegara: <80 % full, 80–100 % downgrade, >=100 % deny.
`GENERATION_ENABLED=false` → `deny:"disabled"`.
Baho: `promptChars/3.2 × inNarx + maxOutputTokens × 0.6 × outNarx`.
**Kun chegarasi Asia/Tashkent (+05:00) bo'yicha.**
Gemini bepul kvotasi tugasa → o'sha provayder `downgrade` oladi (xato emas).
`checkBudget` FAQAT `lib/llm/call.ts` ichidan chaqirilsin.

### 7. Migratsiya `llmcall_system_calls`
`LlmCall.userId` → `String?`, `LlmCall.provider String`, `@@index([createdAt])`.
Indeks sababini migratsiya izohida yoz.

### 8. Admin "Sifat" sahifasi
`app/[locale]/admin/sifat/page.tsx` — model kesimida: chaqiruvlar soni,
o'rtacha narx, umumiy xarajat. (`qualityScore` 08-sessiyadan keyin qo'shiladi.)
Admin paneli i18n'dan ozod — faqat o'zbek lotin.

### 9. `pnpm llm:smoke`
`scripts/llm-smoke.ts` — ikkala provayderga bittadan chaqiruv, javobni va
yozilgan `LlmCall` qatorini konsolga chiqaradi.

### 10. Testlar
- `llm-pricing` — narx matematikasi, kesh koeffitsientlari, 6 xona yaxlitlash, bepul kvota → 0
- `llm-router` — daraja×hukm matritsasi, `deny` provayderga bormasligi, provayderlararo zaxira
- `llm-experiment` — bitta `documentId` doim bitta provayder; 1000 namunada ~50/50
- `llm-call` — fake provayder bilan: xato bo'lsa ham qator yoziladi; jurnal
  throw qilsa chaqiruv yiqilmaydi; Zod validatsiyasi xatosi
- **`llm-guard`** — manba skani (`tokens-guard.test.ts` uslubida):
  `@anthropic-ai/sdk` va `@google/genai` faqat `lib/llm/providers/` da;
  `prisma.llmCall.create` faqat `lib/llm/log.ts` da
- `budget-guard` — 79/80/99/100 % chegaralari, `GENERATION_ENABLED=false`
- `budget-spend` — Toshkent kun chegarasi arifmetikasi

### 11. `.env.example`
`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `LLM_AB_ENABLED`,
`LLM_DAILY_BUDGET_USD`, `LLM_USER_DAILY_BUDGET_USD` — har biriga izoh.

## Qilma
- UI, sahifa, server action — YO'Q (admin/sifat dan tashqari)
- Generatsiya mantiqi, hujjat, kredit — YO'Q
- Erkin matn qaytaradigan chaqiruv yo'li — YO'Q, faqat Zod sxemasi bilan
- Model ID'larini xotiradan yozish — YO'Q, hujjatdan tasdiqla

## Qabul mezonlari
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — 0 xato
- [ ] `pnpm llm:smoke` ikkala provayderdan javob oladi
- [ ] Har chaqiruvdan keyin `LlmCall` da provider, model, tokensIn, tokensOut, costUsd to'g'ri
- [ ] `LLM_MONTHLY_BUDGET_USD=0` → tarmoqqa chiqmasdan xato qaytadi
- [ ] Bitta provayderning kalitini buzsangiz → ikkinchisi ishlaydi
- [ ] `llm-guard` testi SDK importini boshqa joyda topsa yiqiladi
- [ ] Mavjud testlarning birortasi buzilmagan

## Ish tartibi
1. Gemini model ID va narxlarini hujjatdan tasdiqlab, menga ayt
2. `feat/llm-qatlami` branch'ida ishla
3. Migratsiyani `pnpm db:migrate` bilan o'zing ishlat
4. Oxirida: o'zgargan fayllar + men Vercel'ga qo'yishim kerak bo'lgan env'lar
5. PR och
