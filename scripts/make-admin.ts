import { createScriptDb } from "./script-db";

/**
 *   pnpm make-admin <telegramId>
 *
 * Foydalanuvchini ADMIN qiladi. Identifikator — Telegram ID (bot orqali
 * kirganda ham o'sha), chunki email/parol yo'q.
 *
 * ROL SESSIYADA KESHLANMAYDI: sessiya JWT'ida faqat `sub`, `onb`, `sv` bor,
 * rol esa har `auth()` chaqiruvida bazadan o'qiladi — shuning uchun bu
 * skriptdan keyin foydalanuvchi qayta kirishi SHART EMAS, keyingi sahifa
 * yuklashda /admin ochiladi.
 */
async function main() {
  const raw = process.argv[2];
  if (!raw) {
    throw new Error("Ishlatilishi: pnpm make-admin <telegramId>");
  }

  let telegramId: bigint;
  try {
    telegramId = BigInt(raw);
  } catch {
    throw new Error(`telegramId butun son bo'lishi kerak (topildi: "${raw}")`);
  }

  const db = createScriptDb();
  try {
    const user = await db.user.findFirst({
      where: { telegramId, deletedAt: null },
      select: { id: true, fullName: true, role: true },
    });
    if (!user) {
      throw new Error(
        `Telegram ID ${telegramId} bilan foydalanuvchi topilmadi. ` +
          `Avval botdan bir marta kirsin, keyin qayta urinib ko'ring.`,
      );
    }
    if (user.role === "ADMIN") {
      console.log(`${user.fullName} allaqachon ADMIN — o'zgarish yo'q.`);
      return;
    }

    await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    console.log(`${user.fullName} endi ADMIN.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
