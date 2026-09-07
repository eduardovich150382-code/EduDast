import { devLogin } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";

/**
 * Sof server komponent — client JS umuman yo'q. `/kirish/page.tsx` buni
 * faqat `NODE_ENV === "development" && DEV_LOGIN_ENABLED === "true"`
 * bo'lganda render qiladi (lib/auth/dev-login.ts da izohlangan uch
 * qatlamli himoyaning birinchisi).
 */
export function DevLoginForm({ label }: { label: string }) {
  return (
    <form action={devLogin}>
      <Button type="submit" variant="outline" className="w-full">
        {label}
      </Button>
    </form>
  );
}
