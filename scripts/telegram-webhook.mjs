#!/usr/bin/env node
/**
 * Telegram bot webhook'ini o'rnatadi/tekshiradi.
 *
 *   pnpm tg:webhook https://edudast.vercel.app   # o'rnatish
 *   pnpm tg:webhook                              # joriy holatni ko'rish
 *   pnpm tg:webhook --delete                     # o'chirish
 *
 * NEGA SKRIPT: `setWebhook` — bir martalik sozlash amali, ilova kodida
 * turishi kerak emas (har deploy'da qayta chaqirilsa Telegram limitiga
 * urilamiz). Skript `.env.local` dan token va sirni o'zi o'qiydi.
 *
 * DIQQAT: token hech qayerda chop etilmaydi — na URL, na xato matnida.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN topilmadi (.env.local).");
  process.exit(1);
}

async function api(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return response.json();
}

const arg = process.argv[2];

if (!arg) {
  const info = await api("getWebhookInfo");
  console.log(JSON.stringify(info.result ?? info, null, 2));
  process.exit(0);
}

if (arg === "--delete") {
  const result = await api("deleteWebhook", { drop_pending_updates: true });
  console.log(result.ok ? "Webhook o'chirildi." : `Xato: ${result.description}`);
  process.exit(result.ok ? 0 : 1);
}

if (!secret) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET topilmadi. `openssl rand -hex 32` bilan yarating\n" +
      "va uni HAM .env.local ga, HAM Vercel muhit o'zgaruvchilariga qo'shing.",
  );
  process.exit(1);
}

let base;
try {
  base = new URL(arg);
} catch {
  console.error(`Manzil noto'g'ri: ${arg}`);
  process.exit(1);
}
if (base.protocol !== "https:") {
  console.error("Telegram faqat HTTPS webhook'ni qabul qiladi.");
  process.exit(1);
}

const url = new URL("/api/telegram/webhook", base).toString();
const result = await api("setWebhook", {
  url,
  secret_token: secret,
  // Bizga faqat xabarlar kerak — qolgan turlari behuda chaqiruv.
  allowed_updates: ["message"],
  drop_pending_updates: true,
});

if (!result.ok) {
  console.error(`Xato: ${result.description}`);
  process.exit(1);
}

console.log(`Webhook o'rnatildi: ${url}`);
