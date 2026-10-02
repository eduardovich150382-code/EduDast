import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/ish` bo'limining yuklanish holati.
 *
 * Bosh sahifa har yuklashda faol o'quv yilini, sinflarni, dars jadvalini va
 * haftaning hujjatlarini o'qiydi — ya'ni bu ekran haqiqatan ko'rinadi.
 *
 * MATN YO'Q: skeleton kelayotgan narsaning shaklini ko'rsatadi
 * (`hujjat/[id]/loading.tsx` bilan bir xil qaror), shuning uchun i18n
 * kaliti ham kerak emas.
 */
export default function IshLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
