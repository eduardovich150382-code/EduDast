import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-heading text-2xl font-semibold text-ink">
        {t("title")}
      </h1>
      <p className="text-ink-2">{t("description")}</p>
    </div>
  );
}
