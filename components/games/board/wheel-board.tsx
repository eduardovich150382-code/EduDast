"use client";

import { Eye, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScoreBar } from "@/components/games/board/score";
import { Button } from "@/components/ui/button";
import type { BuiltWheel } from "@/lib/games/types";
import { SECTOR_ANGLE } from "@/lib/games/wheel";

/**
 * Omad g'ildiragi — smart doska pleyeri (15-sessiya).
 *
 * TEGINISH NISHONLARI >= 60 px (spetsifikatsiya, barmoq uchun):
 * `size="touch"` tugmalar va `.game-action` klassi shuni beradi.
 * KLAVIATURA HAM ishlaydi — bo'shliq/Enter asosiy amalni bajaradi.
 *
 * `spins` PROP — urug'dan hisoblangan DETERMINISTIK ketma-ketlik
 * (`lib/games/wheel.ts:spinSequence`). Klientda `Math.random` ISHLATILMAYDI:
 * aks holda bitta hujjatni ikki marta ochgan o'qituvchi boshqa savollar
 * ketma-ketligini olardi.
 *
 * RANGLAR TOKENSIZ: `components/games/**` CLAUDE.md ning 2-qoidasidan ozod
 * (smart doskadagi o'yin bolalar uchun bayramona ko'rinishi kerak).
 */

/** Sektor ranglari — bayramona, lekin bir-biridan ajralib turadigan. */
const SECTOR_COLORS = [
  "#e05d51",
  "#f0b458",
  "#2fa693",
  "#4a8fd4",
  "#c77dd4",
  "#6fb84a",
  "#e8873d",
  "#5bc0c7",
];

/** Animatsiya davomiyligi, ms. Pastdagi `transition` bilan bir xil. */
const SPIN_MS = 3200;

/** Aylantirishda qancha to'liq aylanish qilinadi — tomoshaga. */
const FULL_TURNS = 4;

type Phase = "idle" | "spinning" | "question" | "answer";

export function WheelBoard({ game, spins }: { game: BuiltWheel; spins: readonly number[] }) {
  const tG = useTranslations("Games");

  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  // Burchak O'SIB BORADI, nolga qaytmaydi: `rotate(380deg)` dan `rotate(20deg)`
  // ga o'tish teskari aylanish bo'lib ko'rinardi.
  const [angle, setAngle] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Komponent uzilsa taymer tozalanadi: aks holda `setPhase` yo'q
  // komponentda chaqirilardi.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const sectorIndex = spins[turn] ?? 0;
  const sector = game.sectors[sectorIndex];
  const finished = turn >= spins.length;

  const spin = useCallback(() => {
    if (phase === "spinning" || finished) return;

    const target = spins[turn] ?? 0;
    // Nishon sektorning MARKAZI ko'rsatkichga (yuqoriga) kelishi kerak.
    const targetAngle = 360 * FULL_TURNS - (target * SECTOR_ANGLE + SECTOR_ANGLE / 2);

    setPhase("spinning");
    setAngle((current) => current + targetAngle);

    timer.current = setTimeout(() => {
      setPhase("question");
    }, SPIN_MS);
  }, [phase, finished, spins, turn]);

  const reveal = useCallback(() => {
    setPhase("answer");
    setScore((current) => current + 1);
  }, []);

  const nextTurn = useCallback(() => {
    setTurn((current) => current + 1);
    setPhase("idle");
  }, []);

  const restart = useCallback(() => {
    setTurn(0);
    setPhase("idle");
    setScore(0);
    // `angle` QAYTARILMAYDI: g'ildirak turgan joyida qoladi va keyingi
    // aylantirish shu joydan davom etadi. Nolga qaytarish ekranda
    // sakrash bo'lib ko'rinardi.
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (phase === "idle") spin();
      else if (phase === "question") reveal();
      else if (phase === "answer") nextTurn();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, spin, reveal, nextTurn]);

  return (
    <div className="game-board">
      <ScoreBar
        score={score}
        progress={`${String(Math.min(turn + 1, spins.length))}/${String(spins.length)}`}
        onRestart={restart}
      />

      <div className="wheel-stage">
        <div className="wheel-pointer" aria-hidden="true" />
        <svg
          viewBox="-100 -100 200 200"
          className="wheel-svg"
          style={{
            transform: `rotate(${String(angle)}deg)`,
            transition:
              phase === "spinning"
                ? `transform ${String(SPIN_MS)}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
                : "none",
          }}
          role="img"
          aria-label={tG("wheelHint")}
        >
          {game.sectors.map((item, index) => (
            <path
              key={item.category}
              d={sectorPath(index)}
              fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
              stroke="#ffffff"
              strokeWidth="1"
            />
          ))}
          {game.sectors.map((item, index) => (
            <text
              key={`${item.category}-label`}
              className="wheel-label"
              transform={labelTransform(index)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
            >
              {item.category}
            </text>
          ))}
        </svg>
      </div>

      <div className="wheel-panel">
        {finished && <p className="wheel-done">{tG("done")}</p>}

        {!finished && phase === "idle" && (
          <>
            <p className="wheel-hint">{tG("wheelHint")}</p>
            <Button type="button" size="touch" className="game-action" onClick={spin}>
              <Play className="size-5" strokeWidth={1.5} />
              {tG("spin")}
            </Button>
          </>
        )}

        {phase === "spinning" && <p className="wheel-hint">{tG("spinning")}</p>}

        {!finished && sector !== undefined && (phase === "question" || phase === "answer") && (
          <>
            <p className="wheel-category">{sector.category}</p>
            <p className="wheel-question">{sector.question}</p>

            {phase === "question" && (
              <Button type="button" size="touch" className="game-action" onClick={reveal}>
                <Eye className="size-5" strokeWidth={1.5} />
                {tG("reveal")}
              </Button>
            )}

            {phase === "answer" && (
              <>
                <p className="wheel-answer">
                  <span className="wheel-answer-label">{tG("answer")}</span>
                  {sector.answer}
                </p>
                <Button type="button" size="touch" className="game-action" onClick={nextTurn}>
                  <Play className="size-5" strokeWidth={1.5} />
                  {tG("spin")}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Bitta sektorning SVG yo'li — radius 100, markaz (0, 0). */
function sectorPath(index: number): string {
  const start = (index * SECTOR_ANGLE - 90) * (Math.PI / 180);
  const end = ((index + 1) * SECTOR_ANGLE - 90) * (Math.PI / 180);
  const x1 = Math.cos(start) * 100;
  const y1 = Math.sin(start) * 100;
  const x2 = Math.cos(end) * 100;
  const y2 = Math.sin(end) * 100;
  // `largeArcFlag` har doim 0: sektor 45 gradus, ya'ni 180 dan kichik.
  return `M 0 0 L ${String(x1)} ${String(y1)} A 100 100 0 0 1 ${String(x2)} ${String(y2)} Z`;
}

/** Kategoriya yorlig'ining joyi — sektor markazida, radiusning 65% ida. */
function labelTransform(index: number): string {
  const mid = (index * SECTOR_ANGLE + SECTOR_ANGLE / 2 - 90) * (Math.PI / 180);
  const x = Math.cos(mid) * 65;
  const y = Math.sin(mid) * 65;
  const rotation = index * SECTOR_ANGLE + SECTOR_ANGLE / 2;
  return `translate(${String(x)} ${String(y)}) rotate(${String(rotation)})`;
}
