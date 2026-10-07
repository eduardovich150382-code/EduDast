"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ScoreBar } from "@/components/games/board/score";
import type { BuiltWordSearch } from "@/lib/games/types";
import { matchWord, type Point } from "@/lib/games/word-search";

/**
 * So'z qidirish — smart doska pleyeri (15-sessiya).
 *
 * MEXANIKA: so'zning BIRINCHI va OXIRGI harfini ketma-ket bosish
 * (spetsifikatsiyadagi mexanika — smart doskada barmoq bilan ishlaydi,
 * chizib tortishdan ko'ra ancha ishonchli). Topilgan so'z yashil bo'ladi,
 * BALL oshadi.
 *
 * TANLOV MANTIG'I KOMPONENTDA EMAS — `lib/games/word-search.ts` dagi
 * `matchWord`/`segmentBetween` da. Sabab: bu loyihada React test muhiti
 * yo'q (vitest `node`, jsdom ham, RTL ham yo'q), ya'ni komponent ichidagi
 * mantiq umuman testlanmaydi.
 *
 * TEGINISH NISHONI: har katak `min-height: 60px` (`.ws-cell`), ya'ni
 * 12x12 panjara 720 px dan kichik ekranda ham barmoq uchun yetarli
 * (`clamp` bilan kichrayadi, lekin katta ekranda — smart doskada — to'liq).
 */
export function WordSearchBoard({ game }: { game: BuiltWordSearch }) {
  const tG = useTranslations("Games");

  const [found, setFound] = useState<string[]>([]);
  /** Birinchi bosilgan katak. `null` — tanlov boshlanmagan. */
  const [anchor, setAnchor] = useState<Point | null>(null);

  // Topilgan so'zlarning kataklari — yashil bo'yash uchun.
  const [litCells, setLitCells] = useState<string>("");

  const words = game.placed.map((placed) => placed.word);
  const remaining = words.filter((word) => !found.includes(word));

  /**
   * `useCallback` ATAYLAB YO'Q.
   *
   * `remaining` har render'da yangi massiv, ya'ni uni bog'liqlik ro'yxatiga
   * qo'yish memoizatsiyani baribir bekor qilardi — React Compiler esa buni
   * xato deb hisoblaydi ("existing memoization could not be preserved") va
   * BUTUN komponentni optimizatsiyadan chiqarib tashlaydi. Oddiy funksiya
   * kompilyatorga o'z ishini qilishga imkon beradi.
   */
  function press(row: number, col: number): void {
    const point = { row, col };

    if (anchor === null) {
      setAnchor(point);
      return;
    }

    // AYNI KATAKNI qayta bosish tanlovni bekor qiladi: bola noto'g'ri
    // boshlagan bo'lsa chiqish yo'li bo'lishi kerak.
    if (anchor.row === row && anchor.col === col) {
      setAnchor(null);
      return;
    }

    const hit = matchWord(game.grid, remaining, anchor, point);
    setAnchor(null);
    if (hit === null) return;

    setFound((current) => [...current, hit.word]);
    setLitCells((current) => `${current}${hit.points.map(cellKey).join("|")}|`);
  }

  function restart(): void {
    setFound([]);
    setAnchor(null);
    setLitCells("");
  }

  const isLit = (row: number, col: number) => litCells.includes(`${cellKey({ row, col })}|`);
  const isAnchor = (row: number, col: number) => anchor?.row === row && anchor.col === col;

  const done = remaining.length === 0;

  return (
    <div className="game-board">
      <ScoreBar
        score={found.length}
        progress={`${String(found.length)}/${String(words.length)}`}
        onRestart={restart}
      />

      <p className="game-hint game-chrome">{done ? tG("done") : tG("wordSearchHint")}</p>

      <div className="ws-layout">
        <div
          className="ws-grid"
          style={{ gridTemplateColumns: `repeat(${String(game.size)}, minmax(0, 1fr))` }}
          role="grid"
          aria-label={tG("wordSearchHint")}
        >
          {game.grid.map((row, rowIndex) =>
            row.map((letter, colIndex) => (
              <button
                key={`${String(rowIndex)}-${String(colIndex)}`}
                type="button"
                className={cellClass(isLit(rowIndex, colIndex), isAnchor(rowIndex, colIndex))}
                onClick={() => {
                  press(rowIndex, colIndex);
                }}
                aria-pressed={isAnchor(rowIndex, colIndex)}
              >
                {letter}
              </button>
            )),
          )}
        </div>

        <div className="ws-words">
          <h2 className="ws-words-title">{tG("words")}</h2>
          <ul className="ws-words-list">
            {words.map((word) => (
              <li key={word} className={found.includes(word) ? "ws-word is-found" : "ws-word"}>
                {word}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function cellKey(point: Point): string {
  return `${String(point.row)}:${String(point.col)}`;
}

/**
 * Katak klasslari.
 *
 * `litCells` SATRDA saqlanadi, `Set` da emas: `useState` ga `Set`
 * qo'yilsa uni o'zgartirish yangi havola yasashni talab qiladi va
 * "joyida o'zgartirish" xatosi osongina kirib kelardi. Satr esa
 * o'zgarmas qiymat.
 */
function cellClass(lit: boolean, anchored: boolean): string {
  if (lit) return "ws-cell is-found";
  if (anchored) return "ws-cell is-anchor";
  return "ws-cell";
}
