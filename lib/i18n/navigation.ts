import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Next.js navigatsiya API'larining tilga moslashtirilgan wrapper'lari.
 * Komponentlarda `next/link` yoki `next/navigation` o'rniga shulardan
 * foydalaning — joriy tilni avtomatik hisobga oladi.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
