import * as Sentry from "@sentry/nextjs";

// DSN yo'q bo'lsa Sentry sukut bo'yicha xato bermay, jim o'zini o'chiradi.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
