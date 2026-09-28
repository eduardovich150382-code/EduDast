/**
 * Hujjat sahifasining skeleti.
 *
 * Sahifa bazadan hujjat va bloklarni o'qiydi — telefonda bu bir necha yuz
 * millisekund. Skeletsiz foydalanuvchi bo'sh oq ekran ko'rardi va
 * generatsiya boshlanmagandek tuyulardi.
 *
 * Matn YO'Q: skelet bir zumda almashadi, unga tarjima qo'shish ortiqcha
 * yuk bo'lardi.
 */
export default function HujjatLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-6 px-4 py-8 sm:px-6"
      aria-hidden
    >
      <div className="h-7 w-2/3 rounded-md bg-muted" />
      <div className="h-12 w-full rounded-xl bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
      </div>
      <div className="h-24 w-full rounded-xl bg-muted" />
    </div>
  );
}
