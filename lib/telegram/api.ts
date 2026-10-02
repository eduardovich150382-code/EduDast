import { normalizeBotToken } from "@/lib/auth/telegram";

/**
 * Telegram Bot API'ga chiquvchi minimal client.
 *
 * XAVFSIZLIK: token URL ichida bo'ladi, shuning uchun bu modul HECH QACHON
 * to'liq URL'ni log qilmaydi va xato matniga qo'ymaydi — faqat metod nomi
 * va Telegram qaytargan `description`.
 *
 * Yangi npm paket ATAYLAB qo'shilmadi (CLAUDE.md "Qilma"): bizga kerak
 * bo'lgani `sendMessage` va `setWebhook` — ikkisi ham oddiy `fetch`.
 */

const API_BASE = "https://api.telegram.org";

type TelegramResponse = { ok: boolean; description?: string; error_code?: number };

/**
 * Chaqiruv natijasi.
 *
 * NEGA `boolean` EMAS: eslatma cron'i bloklangan foydalanuvchini
 * ANIQLASHI kerak. Telegram bot bloklanganda `403` qaytaradi va bu
 * "tarmoq uzildi" dan tubdan farq qiladi — birinchisida `remindersEnabled`
 * o'chiriladi (boshqa iloj yo'q, xabar hech qachon yetmaydi), ikkinchisida
 * esa keyingi yugurishda qayta urinib ko'riladi.
 *
 * `errorCode` — Telegram'ning `error_code` i, tarmoq xatosida `undefined`.
 */
export type TelegramResult = { ok: boolean; errorCode?: number };

const FAILED: TelegramResult = { ok: false };

async function callBotApi(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResult> {
  const token = normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN sozlanmagan.");
    return FAILED;
  }

  try {
    const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Bot javobi keshlanmasin.
      cache: "no-store",
    });

    const data = (await response.json()) as TelegramResponse;
    if (data.ok) return { ok: true };

    console.warn(`[telegram] ${method} rad etildi: ${data.description ?? "?"}`);
    // `error_code` javob tanasida bo'lmasa HTTP statusi ishlatiladi —
    // Telegram amalda ikkisini ham bir xil qiymat bilan qaytaradi.
    return { ok: false, errorCode: data.error_code ?? response.status };
  } catch (error) {
    // `error` ichida URL bo'lishi mumkin (ya'ni token) — shu sabab faqat
    // metod nomi log qilinadi.
    console.error(`[telegram] ${method} so'rovi yuborilmadi.`, error instanceof Error ? error.name : "");
    return FAILED;
  }
}

export function sendMessage(
  chatId: number | string,
  text: string,
  opts: { replyMarkup?: unknown } = {},
): Promise<TelegramResult> {
  return callBotApi("sendMessage", {
    chat_id: chatId,
    text,
    // Foydalanuvchi ismi xabar ichiga tushishi mumkin — HTML/Markdown
    // parse rejimi ATAYLAB yoqilmaydi, aks holda `<` yoki `*` xabarni
    // buzardi yoki inyeksiya nuqtasi bo'lardi.
    disable_web_page_preview: true,
    ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
}
