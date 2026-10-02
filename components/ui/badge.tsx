import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Badge — holat va tur yorliqlari uchun.
 *
 * Variantlar ataylab faqat shadcn'ning struktura tokenlari bilan cheklangan
 * (`primary`, `secondary`, `destructive`, `outline`). EduDast'ning
 * `--accent-2` / `--warn` ranglari bu yerda variant QILINMAYDI: chaqiruv
 * joyida `className="bg-accent-2/10 text-accent-2"` uzatiladi, shunda bu fayl
 * shadcn registry chiqishi holatida qoladi va keyingi `shadcn add` bilan
 * ziddiyatga tushmaydi (CLAUDE.md, 2-qoida buzilmaydi — ikkala utilita ham
 * `app/globals.css` dagi `@theme inline` orqali tokenlardan keladi).
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
