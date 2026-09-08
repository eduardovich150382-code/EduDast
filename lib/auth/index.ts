import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { redirect } from "@/lib/i18n/navigation";
import { readSessionPayload } from "./cookies";
import { isOnboarded } from "./onboarding";

/**
 * Auth'ning HAQIQIY chegarasi. proxy.ts faqat marshrutlaydi (u bazaga
 * bormaydi), foydalanuvchini bazadan tekshirish esa shu yerda.
 *
 * Server komponentlarda va server action'larda shulardan foydalaniladi:
 *   const user = await requireAuth();
 */

function findSessionUser(id: string) {
  return prisma.user.findFirst({
    // `deletedAt: null` MAJBURIY (CLAUDE.md soft delete qoidasi):
    // o'chirilgan foydalanuvchi tirik cookie bilan kira olmasligi kerak.
    where: { id, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      region: true,
      subjects: true,
      grades: true,
      locale: true,
      creditBalance: true,
      sessionVersion: true,
    },
  });
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof findSessionUser>>>;

/**
 * Joriy foydalanuvchi yoki `null`.
 *
 * React `cache()` bilan o'ralgan — bitta render ichida necha marta
 * chaqirilsa ham bazaga bir marta boriladi.
 */
export const auth = cache(async (): Promise<SessionUser | null> => {
  const payload = await readSessionPayload();
  if (!payload) return null;

  const user = await findSessionUser(payload.sub);
  if (!user) return null;

  // Sessiyani bekor qilish: token ichidagi versiya bazadagidan farq qilsa,
  // cookie hali amal qilsa ham sessiya yaroqsiz. Stateless JWT'ni
  // "o'chirish"ning yagona yo'li shu.
  if (user.sessionVersion !== payload.sv) return null;

  return user;
});

// `redirect` turi `never`, shuning uchun `return redirect(...)` — TS uchun
// ham to'g'ri, o'quvchi uchun ham "bu yerdan keyin davom etmaydi" degani.
export async function requireAuth(): Promise<SessionUser> {
  const user = await auth();
  if (!user) return redirect({ href: "/kirish", locale: await getLocale() });
  return user;
}

/**
 * Admin chegarasi.
 *
 * NEGA `notFound()` (404), `redirect` yoki 403 emas: /admin borligini
 * bilish ham ortiqcha ma'lumot. Kirmagan foydalanuvchi ham, oddiy
 * o'qituvchi ham AYNAN bir xil 404 ko'radi.
 *
 * NEGA HAR ACTION'DA ALOHIDA: `app/[locale]/admin/layout.tsx` faqat RSC
 * daraxti render bo'lishini to'sadi. Server action POST'i layout'dan
 * O'TMAYDI — uni to'g'ridan-to'g'ri chaqirish mumkin. Shuning uchun /admin
 * ostidagi har bir action va route handler birinchi qatorda o'zi shuni
 * chaqiradi (server/admin-actions.ts).
 *
 * Rol sessiya JWT'ida EMAS, bazadan o'qiladi (auth()) — ya'ni rolni olib
 * qo'yish darhol kuchga kiradi, foydalanuvchi qayta kirishini kutmaydi.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await auth();
  if (!user || user.role !== "ADMIN") notFound();
  return user;
}

export async function requireOnboarded(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!isOnboarded(user)) {
    return redirect({ href: "/onboarding", locale: await getLocale() });
  }
  return user;
}
