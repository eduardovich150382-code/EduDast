import type { ReactElement } from "react";
import { AnagramBoard } from "@/components/games/board/anagram-board";
import { WheelBoard } from "@/components/games/board/wheel-board";
import { WordSearchBoard } from "@/components/games/board/word-search-board";
import { AnagramSheet } from "@/components/games/print/anagram-sheet";
import { WordSearchSheet } from "@/components/games/print/word-search-sheet";
import type { BuiltGame } from "@/lib/games/types";
import { spinSequence } from "@/lib/games/wheel";

/**
 * Qurilgan o'yin -> komponent (15-sessiya, 3-qatlam).
 *
 * `default` TARMOG'I ATAYLAB YO'Q va QAYTISH TURI ANNOTATSIYA QILINGAN
 * (`: ReactElement`). Ikkisi birga ishlaydi: annotatsiyasiz React
 * komponenti `undefined` qaytarishi mumkin, ya'ni `default` yo'qligi HECH
 * NARSANI ushlamasdi — yetishmagan `case` shunchaki bo'sh ekran berardi.
 * Bu xato 15-sessiyada `components/editor/blocks/index.tsx` da aynan
 * shunday yuz berdi, shuning uchun yangi reyestr darhol annotatsiya bilan
 * yoziladi.
 *
 * SOF REYESTR ALOHIDA FAYLDA (`lib/games/registry.ts`): u React'ga
 * bog'lanmaydi va vitest (`environment: "node"`) ichida erkin import
 * qilinadi. Shu bo'linish tufayli sxema/qurish/narx testlanadi, bu fayl
 * esa faqat ko'rsatish bilan shug'ullanadi.
 */

/** Doska rejimi — smart doska uchun to'liq ekran pleyeri. */
export function GameBoard({ game, seed }: { game: BuiltGame; seed: number }): ReactElement {
  switch (game.kind) {
    case "wheel":
      // Aylantirish ketma-ketligi URUG'DAN — klientda `Math.random` yo'q.
      // Uzunligi sektor sonidan ko'p: o'qituvchi bir savolni ikki marta
      // ko'rishi mumkin, lekin KETMA-KET emas (`spinSequence` kafolati).
      return <WheelBoard game={game} spins={spinSequence(seed, game.sectors.length * 2)} />;
    case "word-search":
      return <WordSearchBoard game={game} />;
    case "anagram":
      return <AnagramBoard game={game} />;
  }
}

/**
 * Varaq rejimi — A4 chop etish.
 *
 * G'ILDIRAK UCHUN `null`: spetsifikatsiya "Varaq yo'q" deydi — aylanadigan
 * g'ildirakni qog'ozga tushirishning ma'nosi yo'q. Chaqiruvchi
 * `GAMES[kind].hasSheet` ni oldin tekshiradi (`/varaq` marshruti
 * `notFound()` beradi), shuning uchun bu tarmoqqa amalda yetib
 * kelinmaydi — lekin tur darajasida `null` ochiq turadi.
 */
export function GameSheet({ game }: { game: BuiltGame }): ReactElement | null {
  switch (game.kind) {
    case "wheel":
      return null;
    case "word-search":
      return <WordSearchSheet game={game} />;
    case "anagram":
      return <AnagramSheet game={game} />;
  }
}
