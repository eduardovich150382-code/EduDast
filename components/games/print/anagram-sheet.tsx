import { getTranslations } from "next-intl/server";
import type { BuiltAnagram } from "@/lib/games/types";

/**
 * Anagramma — A4 varaq (15-sessiya).
 *
 * Har element: ta'rif + aralashgan harflar + BO'SH CHIZIQLAR
 * (spetsifikatsiya). Chiziqlar soni so'z uzunligiga teng, ya'ni bola
 * nechta harf kerakligini ko'rib turadi.
 *
 * SERVER KOMPONENT — varaqda interaktivlik yo'q.
 *
 * Javoblar kaliti ALOHIDA SAHIFADA (`word-search-sheet.tsx` dagi ayni
 * sabab).
 */
export async function AnagramSheet({ game }: { game: BuiltAnagram }) {
  const tG = await getTranslations("Games");

  return (
    <>
      <section className="game-sheet">
        <ol className="sheet-items">
          {game.items.map((item) => (
            <li key={item.word} className="sheet-item">
              <p className="sheet-clue">{item.clue}</p>
              <p className="sheet-letters">{item.scrambled.join(" ")}</p>
              {/* Bo'sh chiziqlar — harf soni bo'yicha. `aria-hidden`:
                  ekran o'qigichga chiziqlarning ma'nosi yo'q, ta'rif
                  allaqachon o'qilgan. */}
              <p className="sheet-blanks" aria-hidden="true">
                {Array.from({ length: item.word.length }, (_, i) => (
                  <span key={i} className="sheet-blank" />
                ))}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="game-answers">
        <h2 className="sheet-subtitle">{tG("answerKey")}</h2>
        <ol className="sheet-answer-list">
          {game.items.map((item) => (
            <li key={item.word}>{item.word}</li>
          ))}
        </ol>
      </section>
    </>
  );
}
