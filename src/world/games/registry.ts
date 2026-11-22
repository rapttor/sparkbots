import { RallySim } from "./rally";
import { RoundSim } from "./rounds";
import type { GameDef, GameId } from "./types";

/** The game registry: add a game here (and a sim in this folder) and idle agents will start playing it. */
export const GAMES: Record<GameId, GameDef> = {
  pong: { id: "pong", name: "Table tennis", icon: "🏓", size: "large", weight: 3, target: 5, create: (rng, t) => new RallySim("pong", rng, t ?? 5) },
  hockey: { id: "hockey", name: "Air hockey", icon: "🏒", size: "large", weight: 2, target: 5, create: (rng, t) => new RallySim("hockey", rng, t ?? 5) },
  rps: { id: "rps", name: "Rock paper scissors", icon: "✊", size: "small", weight: 2, target: 3, create: (rng, t) => new RoundSim("rps", rng, t ?? 3) },
  dice: { id: "dice", name: "Dice", icon: "🎲", size: "small", weight: 2, target: 3, create: (rng, t) => new RoundSim("dice", rng, t ?? 3) },
};
export const GAME_IDS = Object.keys(GAMES) as GameId[];
export const isGameId = (s: unknown): s is GameId => typeof s === "string" && s in GAMES;

/** Weighted pick of a game; `allowed` restricts the choice (e.g. only games a free table exists for). */
export function pickGame(rnd: number, allowed: GameId[] = GAME_IDS): GameId | null {
  const total = allowed.reduce((n, g) => n + GAMES[g].weight, 0);
  if (!total) return null;
  let x = rnd * total;
  for (const g of allowed) { x -= GAMES[g].weight; if (x <= 0) return g; }
  return allowed[allowed.length - 1]!;
}
