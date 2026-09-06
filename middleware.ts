import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // "/api", "/_next", "/_vercel" va nuqtali (fayl) yo'llarni chetlab o'tadi
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)"],
};
