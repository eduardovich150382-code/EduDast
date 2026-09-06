import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {};

const configWithIntl = withNextIntl(nextConfig);

// Sentry org/project sozlanmagan bo'lsa, build vaqtidagi source-map yuklash
// bosqichi butunlay chetlab o'tiladi — xato bermaydi, hech narsa yuklamaydi.
export default process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
  ? withSentryConfig(configWithIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
    })
  : configWithIntl;
