/**
 * `proxy.ts` ning matcher shabloni — ATAYLAB alohida, sof modulda.
 *
 * Sabab: `proxy.ts` ning o'zini testdan import qilib bo'lmaydi
 * (`next-intl/middleware` → `next/server` vitest'ning node ESM
 * hal qilishida yiqiladi). Konstanta shu yerda tursa,
 * tests/proxy-matcher.test.ts aynan production'da ishlatiladigan
 * qiymatni tekshiradi — nusxasini emas.
 *
 * `\\.` aynan shunday yozilishi SHART. Oddiy JS satrida `"\."` → `"."`
 * ga aylanadi, natijada shart `.*.*` bo'lib qoladi; u bo'sh satrni ham
 * topgani uchun salbiy lookahead HAR DOIM yiqiladi va proxy umuman
 * ishlamay qoladi (faqat "/" mos keladi). Bu repo'da aynan shu xato
 * bo'lgan — regressiya testi uni qaytib kelishidan saqlaydi.
 */
export const PROXY_MATCHER = ["/((?!api|_next|_vercel|.*\\..*).*)"];
