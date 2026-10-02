import { Skeleton } from "@/components/ui/skeleton";

/**
 * Hujjatlar ro'yxatining yuklanish holati.
 *
 * MATN YO'Q — ataylab: skeleton kartalar kelayotgan narsaning SHAKLINI
 * ko'rsatadi, "Yuklanmoqda…" yozuvi esa qo'shimcha hech narsa aytmaydi
 * (`app/[locale]/ish/hujjat/[id]/loading.tsx` bilan bir xil qaror). Yon
 * foydasi: i18n kaliti ham kerak emas.
 */
export default function HujjatlarLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-28" />
      </div>

      <ul className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index}>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
