"use client";

import { useEffect, useRef } from "react";

/**
 * Telegram Login Widget — `next/script` ATAYLAB ishlatilmaydi.
 *
 * Widget o'z <script> tegi turgan DOM joyiga <iframe> qo'yadi. `next/script`
 * (va React 19'ning `<script src>` hoisting'i) tegni <head> ga ko'chiradi,
 * shuning uchun iframe noto'g'ri joyga tushib qoladi yoki umuman
 * ko'rinmaydi. Shu sabab skript qo'lda, `useEffect` ichida qo'shiladi —
 * aynan shu `<div>` ichiga.
 */
export function TelegramLoginButton({
  botUsername,
  authUrl,
  lang,
}: {
  botUsername: string;
  authUrl: string;
  lang: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    // Rasm saqlanmaydi (R2 hali sozlanmagan) — ko'rsatilmaydi ham.
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-auth-url", authUrl);
    script.setAttribute("data-lang", lang);
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [botUsername, authUrl, lang]);

  return <div ref={containerRef} className="min-h-10" />;
}
