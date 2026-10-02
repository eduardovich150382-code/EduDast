import * as React from "react"
import { cn } from "cn"

/**
 * Skeleton — `loading.tsx` ekranlari uchun.
 *
 * Rang `bg-muted` dan keladi (`app/globals.css`), shuning uchun tungi rejimda
 * o'zi moslashadi. Balandlik/kenglik chaqiruv joyida beriladi.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
