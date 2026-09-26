import type { AppLocale } from "@/lib/i18n/routing";

type TitledTopic = { titleUz: string; titleUzCyrl: string; titleRu: string };

/**
 * `Topic` jadvalidagi uch tildagi sarlavhadan joriy locale'ga mosini
 * tanlaydi — `lib/subject-name.ts` ning mavzular uchun juftligi.
 *
 * Ikkisi bitta generik funksiyaga birlashtirilmadi: ustun nomlari boshqa
 * (`nameUz` va `titleUz`), birlashtirish esa chaqiruv joyida ustun nomini
 * satr sifatida uzatishga olib kelardi va TypeScript nazorati yo'qolardi.
 */
export function topicTitle(topic: TitledTopic, locale: AppLocale): string {
  if (locale === "uz-Cyrl") return topic.titleUzCyrl;
  if (locale === "ru") return topic.titleRu;
  return topic.titleUz;
}
