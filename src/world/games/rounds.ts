import type { GameSim, Rng } from "./types";

export const RPS_FACES = ["✊", "✋", "✌️"] as const; // rock, paper, scissors
export const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] as const;

/** Which side wins a rock-paper-scissors round (moves 0 rock, 1 paper, 2 scissors); null = draw. */
export function rpsWinner(a: number, b: number): 0 | 1 | null {
  const d = (a - b + 3) % 3;
  return d === 0 ? null : d === 1 ? 0 : 1;
}
/** Two dice each: higher sum wins; null = draw. */
export function diceWinner(a: number, b: number): 0 | 1 | null { return a === b ? null : a > b ? 0 : 1; }

export interface Reveal { a: string; b: string; winner: 0 | 1 | null; round: number }

/**
 * Turn-based games: every `interval` seconds both players throw at once (rock-paper-scissors) or roll (dice, two dice each).
 * Draws are thrown again; first to `target` round wins takes the match.
 */
export class RoundSim implements GameSim {
  score: [number, number] = [0, 0];
  over = false;
  winner: 0 | 1 | null = null;
  last: Reveal | null = null;
  rounds = 0;
  /** The seat you play: rounds then wait for you (a move for rock-paper-scissors, a roll for dice) instead of running on a timer. */
  user: 0 | 1 | null = null;
  private t = 0;

  constructor(readonly kind: "rps" | "dice", private rng: Rng, readonly target = 3, readonly interval = 1.8) {}

  line(): string { return `${this.score[0]} : ${this.score[1]}`; }

  setUser(seat: 0 | 1): void { this.user = seat; }

  step(dt: number): void {
    if (this.over || this.user !== null) return;
    this.t += dt;
    if (this.t < this.interval) return;
    this.t = 0;
    this.play();
  }

  detail(): string { return this.last ? `${this.last.a}  vs  ${this.last.b}` : this.user !== null ? (this.kind === "rps" ? "Pick your move" : "Roll the dice") : ""; }

  /** One round right now. `move` (0 rock, 1 paper, 2 scissors) is yours when you play rock-paper-scissors. */
  play(move?: number): Reveal {
    this.rounds++;
    let a: string, b: string, w: 0 | 1 | null;
    if (this.kind === "rps") {
      let x = Math.floor(this.rng() * 3), y = Math.floor(this.rng() * 3);
      if (this.user === 0 && move !== undefined) x = move; else if (this.user === 1 && move !== undefined) y = move;
      a = RPS_FACES[x]!; b = RPS_FACES[y]!; w = rpsWinner(x, y);
    } else {
      const d = () => 1 + Math.floor(this.rng() * 6);
      const a1 = d(), a2 = d(), b1 = d(), b2 = d();
      a = `${DIE_FACES[a1 - 1]}${DIE_FACES[a2 - 1]} ${a1 + a2}`; b = `${DIE_FACES[b1 - 1]}${DIE_FACES[b2 - 1]} ${b1 + b2}`;
      w = diceWinner(a1 + a2, b1 + b2);
    }
    if (w !== null) {
      this.score[w]++;
      if (this.score[w] >= this.target) { this.over = true; this.winner = w; }
    }
    this.last = { a, b, winner: w, round: this.rounds };
    return this.last;
  }
}
