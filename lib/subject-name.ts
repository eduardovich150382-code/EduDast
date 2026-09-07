import type { AppLocale } from "@/lib/i18n/routing";

type NamedSubject = { nameUz: string; nameUzCyrl: string; nameRu: string };

/** `Subject` jadvalidagi uch tildagi nomdan joriy locale'ga mosini tanlaydi. */
export function subjectName(subject: NamedSubject, locale: AppLocale): string {
  if (locale === "uz-Cyrl") return subject.nameUzCyrl;
  if (locale === "ru") return subject.nameRu;
  return subject.nameUz;
}
