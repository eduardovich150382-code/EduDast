import { CreditGrant } from "@/components/admin/credit-grant";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * O'qituvchilar ro'yxati: joriy balans va kredit berish.
 *
 * Mavjud balans = `creditBalance - creditsHeld` (docs/sessions/06). Uchta
 * ustun ham ko'rsatiladi: band qolgan kredit nosozlik belgisi — generatsiya
 * yo'q vaqtda `Band` nolga teng bo'lishi kerak.
 *
 * `take: 200` — beta davrida foydalanuvchi soni kichik, paginatsiya keyin.
 * `orderBy: createdAt desc` uchun YANGI INDEKS QO'SHILMADI: jadval kichik,
 * ortiqcha indeks Neon 0.5GB ni yeydi (CLAUDE.md baza qoidalari).
 */
export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      creditBalance: true,
      creditsHeld: true,
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">Foydalanuvchilar</h2>
        <p className="text-sm text-ink-2">
          Kredit berish darhol kuchga kiradi va daftarga (CreditTx) yozuv qoldiradi.
          &quot;Band&quot; — generatsiya davomida vaqtincha ushlab turilgan kredit, u yo&apos;q
          vaqtda nol bo&apos;lishi kerak.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-ink-2">
            <tr>
              <th className="px-3 py-2 font-medium">O&apos;qituvchi</th>
              <th className="px-3 py-2 font-medium">Telegram</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 text-right font-medium">Balans</th>
              <th className="px-3 py-2 text-right font-medium">Band</th>
              <th className="px-3 py-2 text-right font-medium">Mavjud</th>
              <th className="px-3 py-2 text-right font-medium">Hujjat</th>
              <th className="px-3 py-2 text-right font-medium">Kredit berish</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-3 py-2 text-ink">{user.fullName}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">
                  {user.username ? `@${user.username}` : "—"}
                </td>
                <td className="px-3 py-2 text-ink-2">{user.role}</td>
                <td className="px-3 py-2 text-right text-ink">{user.creditBalance}</td>
                <td className="px-3 py-2 text-right text-ink-2">{user.creditsHeld}</td>
                <td className="px-3 py-2 text-right text-ink">
                  {user.creditBalance - user.creditsHeld}
                </td>
                <td className="px-3 py-2 text-right text-ink-2">{user._count.documents}</td>
                <td className="px-3 py-2">
                  <CreditGrant userId={user.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
