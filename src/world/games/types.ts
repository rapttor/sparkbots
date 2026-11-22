/** Shared types of the games framework. Everything in `src/world/games/*.ts` (except `*.tsx`) is pure: no React, no three.js, no DOM. */
export type GameId = "pong" | "hockey" | "rps" | "dice" | "billiards" | "hoops";
export type Rng = () => number;

/** A running match. `step` advances it; the hub reads `score`/`over`/`winner`. */
export interface GameSim {
  score: [number, number];
  over: boolean;
  winner: 0 | 1 | null;
  step(dt: number): void;
  /** Short text for the chip and the label above the table, e.g. "3 : 2". */
  line(): string;
  /** Optional second line (turn-based games: what was thrown last). */
  detail?(): string;
}

export interface GameDef {
  id: GameId;
  name: string;
  icon: string;
  /** Which kind of table it needs: a "large" one (ping-pong sized) or a "small" round one. */
  size: "large" | "small";
  weight: number;      // how often idle agents choose it
  target: number;      // points to win
  create(rng: Rng, target?: number): GameSim;
}

/** What gets stored once a match is finished. `uuid` makes a double post harmless. */
export interface GameResult {
  uuid: string;
  at: number;
  game: GameId | "race";
  a: string; b: string;
  aName: string; bName: string;
  scoreA: number; scoreB: number;
  winner: string | null;
}

export interface RankRow { agent: string; name: string; game: GameId | "race" | "all"; wins: number; losses: number; plays: number }

/** Deterministic random numbers (mulberry32), so simulations are testable. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
