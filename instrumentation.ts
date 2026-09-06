import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server komponent, middleware va route handler xatolarini ushlaydi.
// DSN yo'q bo'lsa Sentry.init chaqirilmagan, shuning uchun bu ham jim ishlaydi.
export const onRequestError = Sentry.captureRequestError;
