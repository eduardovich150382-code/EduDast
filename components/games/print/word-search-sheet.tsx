import { getTranslations } from "next-intl/server";
import type { BuiltWordSearch } from "@/lib/games/types";

/**
 * So'z qidirish — A4 varaq (15-sessiya).
 *
 * SERVER KOMPONENT: varaqda interaktivlik yo'q, ya'ni `"use client"` kerak
 * emas va JavaScript'siz ham chop etiladi.
 *
 * JAVOBLAR KALITI ALOHIDA SAHIFADA (`.game-answers` + `break-before: page`,
 * `components/games/games.css`): o'qituvchi birinchi sahifani sinfga tarqatadi,
 * ikkinchisini o'zida qoldiradi. Bitta sahifada bo'lsa varaq
 * tarqatishdan oldin kesilishi kerak bo'lardi.
 *
 * Panjaradagi so'zlar NORMALLASHGAN shaklda (`O'ZBEK` emas, `OZBEK`) —
 * `lib/games/alphabet.ts` dagi qaror. Ro'yxat ham shu shaklda, aks holda
 * bola ro'yxatdagi so'zni panjarada topa olmasdi.
 */
export async function WordSearchSheet({ game }: { game: BuiltWordSearch }) {
  const tG = await getTranslations("Games");

  return (
    <>
      <section className="game-sheet">
        <table className="sheet-grid">
          <tbody>
            {game.grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((letter, colIndex) => (
                  <td key={colIndex}>{letter}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sheet-words">
          <h2 className="sheet-subtitle">{tG("sheetWords")}</h2>
          {/* USTUNLARDA (spetsifikatsiya): `columns` CSS xossasi matnni
              o'zi taqsimlaydi, ya'ni so'z soni o'zgarsa ham varaq
              muvozanatda qoladi. */}
          <ul className="sheet-word-list">
            {game.placed.map((placed) => (
              <li key={placed.word}>{placed.word}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="game-answers">
        <h2 className="sheet-subtitle">{tG("answerKey")}</h2>
        <ol className="sheet-answer-list">
          {game.placed.map((placed) => (
            <li key={placed.word}>
              {placed.word} — {String(placed.row + 1)}:{String(placed.col + 1)}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
