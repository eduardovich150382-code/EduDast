"use client";

import { Check, Eraser, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { ScoreBar } from "@/components/games/board/score";
import { Button } from "@/components/ui/button";
import type { BuiltAnagram } from "@/lib/games/types";

/**
 * Anagramma — smart doska pleyeri (15-sessiya).
 *
 * MEXANIKA: harf plitkalarini bosib bo'sh kataklarni to'ldirish,
 * "Tekshirish" / "Tozalash" / "O'tkazish" tugmalari, "Savol 1/10" va BALL.
 *
 * PLITKA INDEKS BO'YICHA tanlanadi, harf bo'yicha emas: so'zda bir xil
 * harf ikki marta bo'lsa (`KVADRAT` dagi `A`), harf bo'yicha tanlash
 * ikkinchisini ham o'chirib qo'yardi.
 */
export function AnagramBoard({ game }: { game: BuiltAnagram }) {
  const tG = useTranslations("Games");

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  /** Tanlangan plitkalarning INDEKSLARI — bosilish tartibida. */
  const [picked, setPicked] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<"none" | "correct" | "wrong">("none");

  const item = game.items[index];
  const finished = index >= game.items.length;

  const typed = item === undefined ? "" : picked.map((i) => item.scrambled[i] ?? "").join("");

  const pick = useCallback((tileIndex: number) => {
    setVerdict("none");
    setPicked((current) =>
      current.includes(tileIndex)
        ? current.filter((i) => i !== tileIndex)
        : [...current, tileIndex],
    );
  }, []);

  const clear = useCallback(() => {
    setPicked([]);
    setVerdict("none");
  }, []);

  const advance = useCallback(() => {
    setIndex((current) => current + 1);
    setPicked([]);
    setVerdict("none");
  }, []);

  const check = useCallback(() => {
    if (item === undefined) return;
    if (typed === item.word) {
      setScore((current) => current + 1);
      setVerdict("correct");
      return;
    }
    setVerdict("wrong");
  }, [item, typed]);

  const restart = useCallback(() => {
    setIndex(0);
    setScore(0);
    setPicked([]);
    setVerdict("none");
  }, []);

  if (finished) {
    return (
      <div className="game-board">
        <ScoreBar
          score={score}
          progress={`${String(game.items.length)}/${String(game.items.length)}`}
          onRestart={restart}
        />
        <p className="game-done">{tG("done")}</p>
      </div>
    );
  }

  if (item === undefined) return <div className="game-board" />;

  return (
    <div className="game-board">
      <ScoreBar
        score={score}
        progress={`${String(index + 1)}/${String(game.items.length)}`}
        onRestart={restart}
      />

      <p className="ana-position game-chrome">
        {tG("questionOf", { index: index + 1, total: game.items.length })}
      </p>

      <p className="ana-clue">{item.clue}</p>

      {/* Bo'sh kataklar — so'z uzunligi bo'yicha. Bola nechta harf
          kerakligini ko'rib turadi, bu topishning bir qismi. */}
      <div className="ana-slots" aria-label={tG("letters")}>
        {Array.from({ length: item.word.length }, (_, slot) => (
          <span key={slot} className={slotClass(verdict, slot < picked.length)}>
            {picked[slot] === undefined ? "" : (item.scrambled[picked[slot]] ?? "")}
          </span>
        ))}
      </div>

      <div className="ana-tiles">
        {item.scrambled.map((letter, tileIndex) => (
          <button
            key={tileIndex}
            type="button"
            className={picked.includes(tileIndex) ? "ana-tile is-used" : "ana-tile"}
            onClick={() => {
              pick(tileIndex);
            }}
            aria-pressed={picked.includes(tileIndex)}
          >
            {letter}
          </button>
        ))}
      </div>

      {verdict === "correct" && <p className="ana-verdict is-correct">{tG("correct")}</p>}
      {verdict === "wrong" && <p className="ana-verdict is-wrong">{tG("wrong")}</p>}

      <div className="ana-actions game-chrome">
        <Button
          type="button"
          size="touch"
          className="game-action"
          onClick={verdict === "correct" ? advance : check}
          disabled={picked.length !== item.word.length && verdict !== "correct"}
        >
          <Check className="size-5" strokeWidth={1.5} />
          {verdict === "correct" ? tG("skip") : tG("check")}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="touch"
          className="game-action"
          onClick={clear}
          disabled={picked.length === 0}
        >
          <Eraser className="size-5" strokeWidth={1.5} />
          {tG("clear")}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="touch"
          className="game-action"
          onClick={advance}
        >
          <SkipForward className="size-5" strokeWidth={1.5} />
          {tG("skip")}
        </Button>
      </div>
    </div>
  );
}

function slotClass(verdict: "none" | "correct" | "wrong", filled: boolean): string {
  if (verdict === "correct") return "ana-slot is-correct";
  if (verdict === "wrong") return "ana-slot is-wrong";
  return filled ? "ana-slot is-filled" : "ana-slot";
}
