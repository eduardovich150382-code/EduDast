import { prisma } from "@/lib/db";
import type { AppLocale } from "@/lib/i18n/routing";

/**
 * Telegram'dan kelgan shaxsni bazadagi foydalanuvchiga bog'laydi.
 *
 * Ikki kirish yo'li ham (Login Widget callback'i va bot webhook'i) aynan
 * shu funksiyani chaqiradi — aks holda ikki joyda ikki xil `upsert`
 * paydo bo'lardi va ular vaqt o'tib bir-biridan uzoqlashardi.
 */

export type TelegramIdentity = {
  telegramId: bigint;
  fullName: string;
  username: string | null;
};

export type UpsertedUser = {
  id: string;
  subjects: string[];
  grades: number[];
  region: string | null;
  sessionVersion: number;
};

export function upsertTelegramUser(
  identity: TelegramIdentity,
  locale: AppLocale,
): Promise<UpsertedUser> {
  const { telegramId, fullName, username } = identity;

  return prisma.user.upsert({
    where: { telegramId },
    // `locale` faqat yaratishda qo'yiladi — keyinchalik foydalanuvchi
    // tilni almashtirsa, qayta kirish uni bekor qilib yubormasligi kerak.
    create: { telegramId, fullName, username, locale },
    // Rasm (photo_url) SAQLANMAYDI — R2 hali sozlanmagan va kerak ham emas.
    update: { fullName, username },
    select: {
      id: true,
      subjects: true,
      grades: true,
      region: true,
      sessionVersion: true,
    },
  });
}
