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

type TelegramResponse = { ok: boolean; description?: string };

async function callBotApi(
  method: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const token = normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN sozlanmagan.");
    return false;
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
    if (!data.ok) {
      console.warn(`[telegram] ${method} rad etildi: ${data.description ?? "?"}`);
    }
    return data.ok;
  } catch (error) {
    // `error` ichida URL bo'lishi mumkin (ya'ni token) — shu sabab faqat
    // metod nomi log qilinadi.
    console.error(`[telegram] ${method} so'rovi yuborilmadi.`, error instanceof Error ? error.name : "");
    return false;
  }
}

export function sendMessage(
  chatId: number | string,
  text: string,
  opts: { replyMarkup?: unknown } = {},
): Promise<boolean> {
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
