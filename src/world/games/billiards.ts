import { TABLE } from "./rally";
import type { GameSim, Rng } from "./types";

/**
 * Billiards, pure: ball physics, pocketing, the rules (turn order, groups, fouls, win) and a cheap AI. No React / three.js:
 * the scene only reads `sim.balls` once per frame. Table units are metres, the field is `TABLE` (x along the length, z across).
 *
 * Variants (the table cloth colour follows the variant):
 *  - "eight" (green):  15 balls, 7 solids (1-7) vs 7 stripes (9-15) and the 8. First legal pot picks your group; clear it, then sink the 8.
 *    The 8 early (or together with a scratch) loses. A scratch or a wrong first contact gives the other side the cue ball in hand.
 *  - "quick" (blue):   7 balls, any ball counts, first to `target` pots wins; a scratch ends the turn.
 */
export type Variant = "eight" | "quick";
export const VARIANTS: Record<Variant, { cloth: string; balls: number; target: number }> = {
  eight: { cloth: "#1f7a46", balls: 15, target: 7 },
  quick: { cloth: "#1d5fa8", balls: 7, target: 4 },
};
export const clothColor = (v: Variant): string => VARIANTS[v].cloth;

export const BALL_R = 0.05;
export const POCKET_R = 0.1;
export const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [-TABLE.L / 2, -TABLE.W / 2], [0, -TABLE.W / 2], [TABLE.L / 2, -TABLE.W / 2],
  [-TABLE.L / 2, TABLE.W / 2], [0, TABLE.W / 2], [TABLE.L / 2, TABLE.W / 2],
];
const HALF_L = TABLE.L / 2 - BALL_R, HALF_W = TABLE.W / 2 - BALL_R;
const FRICTION = 1.1;        // 1/s: velocity decays exponentially
const STOP_SPEED = 0.03;
const WALL_E = 0.8, BALL_E = 0.96;
const SUBSTEP = 1 / 240;
export const MAX_STRENGTH = 9;
const SPEED_PER_LEVEL = 0.55; // m/s per strength level

export interface BBall { id: number; x: number; z: number; vx: number; vz: number; out: boolean }
export const CUE = 0;
/** "solid" = 1-7, "stripe" = 9-15, "eight" = 8, "cue" = 0. */
export const kindOf = (id: number): "cue" | "solid" | "stripe" | "eight" => (id === 0 ? "cue" : id === 8 ? "eight" : id < 8 ? "solid" : "stripe");

/** Initial layout: cue ball on the head spot, object balls racked in a triangle on the foot spot (the 8 in the middle for "eight"). */
export function rack(variant: Variant, rng: Rng): BBall[] {
  const n = VARIANTS[variant].balls;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  if (variant === "eight") {
    const rest = ids.filter((i) => i !== 8);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j]!, rest[i]!]; }
    ids.length = 0; ids.push(...rest.slice(0, 4), 8, ...rest.slice(4)); // the 8 is the 5th = middle of the 3rd row
  }
  const balls: BBall[] = [{ id: CUE, x: -TABLE.L / 4, z: 0, vx: 0, vz: 0, out: false }];
  const foot = TABLE.L / 4, d = BALL_R * 2 + 0.002;
  let k = 0;
  for (let row = 0; k < n; row++) {
    for (let c = 0; c <= row && k < n; c++) balls.push({ id: ids[k++]!, x: foot + row * d * 0.866, z: (c - row / 2) * d, vx: 0, vz: 0, out: false });
  }
  return balls;
}

export const moving = (balls: BBall[]): boolean => balls.some((b) => !b.out && (b.vx !== 0 || b.vz !== 0));

/** Strength 1-9 -> cue ball speed. */
export const shotSpeed = (strength: number): number => Math.max(1, Math.min(MAX_STRENGTH, Math.round(strength))) * SPEED_PER_LEVEL;
/** Holding E: the longer, the harder (1 s per 3 levels, wraps back at 9 so it can be released at any level). */
export const strengthFromHold = (seconds: number): number => 1 + Math.min(MAX_STRENGTH - 1, Math.floor(Math.max(0, seconds) * 3));

export interface ShotReport { potted: number[]; firstHit: number | null }

/** Events of one step, collected by the caller. */
function resolveStep(balls: BBall[], dt: number, report: ShotReport | null): void {
  const decay = Math.exp(-FRICTION * dt);
  for (const b of balls) {
    if (b.out) continue;
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.vx *= decay; b.vz *= decay;
    if (b.vx * b.vx + b.vz * b.vz < STOP_SPEED * STOP_SPEED) { b.vx = 0; b.vz = 0; }
    for (const [px, pz] of POCKETS) {
      if (Math.hypot(b.x - px, b.z - pz) < POCKET_R) { b.out = true; b.vx = b.vz = 0; report?.potted.push(b.id); break; }
    }
    if (b.out) continue;
    if (b.x > HALF_L) { b.x = HALF_L; b.vx = -Math.abs(b.vx) * WALL_E; } else if (b.x < -HALF_L) { b.x = -HALF_L; b.vx = Math.abs(b.vx) * WALL_E; }
    if (b.z > HALF_W) { b.z = HALF_W; b.vz = -Math.abs(b.vz) * WALL_E; } else if (b.z < -HALF_W) { b.z = -HALF_W; b.vz = Math.abs(b.vz) * WALL_E; }
  }
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]!;
    if (a.out) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j]!;
      if (c.out) continue;
      const dx = c.x - a.x, dz = c.z - a.z, dist2 = dx * dx + dz * dz, min = BALL_R * 2;
      if (dist2 >= min * min || dist2 === 0) continue;
      const dist = Math.sqrt(dist2), nx = dx / dist, nz = dz / dist;
      const push = (min - dist) / 2;
      a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push;
      const rel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz; // closing speed along the normal
      if (rel <= 0) continue;
      const imp = (1 + BALL_E) * rel / 2;
      a.vx -= imp * nx; a.vz -= imp * nz; c.vx += imp * nx; c.vz += imp * nz;
      if (report && report.firstHit === null && (a.id === CUE || c.id === CUE)) report.firstHit = a.id === CUE ? c.id : a.id;
    }
  }
}

/** Advance the physics by `dt` seconds in fixed sub-steps (pure function of the balls; pockets/contacts go into `report`). */
export function stepBalls(balls: BBall[], dt: number, report: ShotReport | null = null): void {
  let left = dt;
  while (left > 1e-9) { const h = Math.min(SUBSTEP, left); resolveStep(balls, h, report); left -= h; }
}

/** Hit the cue ball: angle in radians (0 = +x), strength 1-9. */
export function strike(balls: BBall[], angle: number, strength: number): void {
  const cue = balls[0]!, v = shotSpeed(strength);
  cue.vx = Math.cos(angle) * v; cue.vz = Math.sin(angle) * v;
}

// ---------------------------------------------------------------- rules

export type Group = "solid" | "stripe";
export interface RulesState {
  variant: Variant;
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  /** Balls already off the table (ids). */
  down: ReadonlySet<number>;
}
export interface Verdict {
  /** Who shoots next. */
  next: 0 | 1;
  groups: [Group | null, Group | null];
  /** Opponent gets the cue ball in hand. */
  foul: boolean;
  winner: 0 | 1 | null;
  note: string;
}

const other = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);
const ownLeft = (g: Group, down: ReadonlySet<number>): number => { let n = 0; for (let id = g === "solid" ? 1 : 9; id <= (g === "solid" ? 7 : 15); id++) if (!down.has(id)) n++; return n; };

/** Judge a finished shot. `down` already includes this shot's pots. Pure: turn order, groups, fouls, win. */
export function judgeShot(s: RulesState, rep: ShotReport): Verdict {
  const me = s.turn, opp = other(me);
  const scratch = rep.potted.includes(CUE);
  const object = rep.potted.filter((i) => i !== CUE);
  const groups: [Group | null, Group | null] = [s.groups[0], s.groups[1]];
  if (s.variant === "quick") {
    const foul = scratch || rep.firstHit === null;
    const counted = foul ? [] : object;
    return { next: counted.length ? me : opp, groups, foul, winner: null, note: foul ? "foul" : counted.length ? `pots ${counted.join(",")}` : "misses" };
  }
  // eight
  const mine = groups[me];
  const eightIn = object.includes(8);
  if (eightIn) {
    const wins = !scratch && mine !== null && ownLeft(mine, new Set([...s.down].filter((i) => i !== 8))) === 0 && rep.firstHit !== null;
    return { next: me, groups, foul: false, winner: wins ? me : opp, note: wins ? "sinks the 8 and wins" : "sinks the 8 too early" };
  }
  let foul = scratch || rep.firstHit === null;
  if (!foul && mine !== null) {
    const first = kindOf(rep.firstHit!);
    const clear = ownLeft(mine, new Set([...s.down].filter((i) => !object.includes(i)))) === 0; // group was cleared before this shot: the 8 is legal
    if (!(first === mine || (clear && first === "eight"))) foul = true;
  } else if (!foul && kindOf(rep.firstHit!) === "eight") foul = true; // open table: the 8 may not be hit first
  if (foul) return { next: opp, groups, foul: true, winner: null, note: scratch ? "scratches" : "fouls" };
  if (mine === null) {
    const first = object.find((i) => kindOf(i) === "solid" || kindOf(i) === "stripe");
    if (first !== undefined) { groups[me] = kindOf(first) as Group; groups[opp] = groups[me] === "solid" ? "stripe" : "solid"; return { next: me, groups, foul: false, winner: null, note: `pots ${first} (${groups[me]}s)` }; }
    return { next: opp, groups, foul: false, winner: null, note: "misses" };
  }
  if (object.some((i) => kindOf(i) === mine)) return { next: me, groups, foul: false, winner: null, note: `pots ${object.filter((i) => kindOf(i) === mine).join(",")}` };
  return { next: opp, groups, foul: false, winner: null, note: object.length ? "pots the wrong ball" : "misses" };
}

// ---------------------------------------------------------------- AI

export interface Plan { angle: number; strength: number }
const gauss = (rng: Rng): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** Is the straight path of a ball of radius R from (x0,z0) to (x1,z1) free of the other balls (skipping `skip` ids)? */
function clear(balls: BBall[], x0: number, z0: number, x1: number, z1: number, skip: number[]): boolean {
  const dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz;
  for (const b of balls) {
    if (b.out || skip.includes(b.id)) continue;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.z - z0) * dz) / len2));
    if (Math.hypot(b.x - (x0 + dx * t), b.z - (z0 + dz * t)) < BALL_R * 2 - 0.004) return false;
  }
  return true;
}

/** Pick a shot: the easiest (ball, pocket) pair by the ghost-ball method, then add aim error that shrinks with `skill` (0..1). */
export function planShot(balls: BBall[], legal: (id: number) => boolean, skill: number, rng: Rng): Plan {
  const cue = balls[0]!;
  let best: { angle: number; cost: number; dist: number } | null = null;
  for (const b of balls) {
    if (b.out || b.id === CUE || !legal(b.id)) continue;
    for (const [px, pz] of POCKETS) {
      const tx = px - b.x, tz = pz - b.z, tl = Math.hypot(tx, tz);
      if (tl < 1e-6) continue;
      const gx = b.x - (tx / tl) * BALL_R * 2, gz = b.z - (tz / tl) * BALL_R * 2; // where the cue ball must be at the moment of impact
      if (Math.abs(gx) > HALF_L || Math.abs(gz) > HALF_W) continue;
      const cx = gx - cue.x, cz = gz - cue.z, cl = Math.hypot(cx, cz);
      if (cl < 1e-6) continue;
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * tx + cz * tz) / (cl * tl))));
      if (cut > 1.15) continue; // too thin
      if (!clear(balls, cue.x, cue.z, gx, gz, [CUE, b.id]) || !clear(balls, b.x, b.z, px, pz, [CUE, b.id])) continue;
      const cost = cl + tl * 1.5 + cut * 1.2;
      if (!best || cost < best.cost) best = { angle: Math.atan2(cz, cx), cost, dist: cl + tl };
    }
  }
  if (!best) { // no clean pot: tap the nearest legal ball and hope
    let near: BBall | null = null;
    for (const b of balls) if (!b.out && b.id !== CUE && legal(b.id) && (!near || Math.hypot(b.x - cue.x, b.z - cue.z) < Math.hypot(near.x - cue.x, near.z - cue.z))) near = b;
    const tgt = near ?? balls.find((b) => !b.out && b.id !== CUE)!;
    best = { angle: Math.atan2(tgt.z - cue.z, tgt.x - cue.x), cost: 0, dist: Math.hypot(tgt.x - cue.x, tgt.z - cue.z) + 0.6 };
  }
  const need = (best.dist * FRICTION * 1.15 + 0.45) / SPEED_PER_LEVEL; // enough speed to arrive plus a margin
  const strength = Math.max(1, Math.min(MAX_STRENGTH, Math.round(need)));
  const sigma = (1 - skill) * 0.03 + strength * 0.0018;
  return { angle: best.angle + gauss(rng) * sigma, strength };
}

// ---------------------------------------------------------------- the match

export type BilliardsPhase = "aim" | "roll";
export const SHOT_LIMIT = 70; // shots per side before the match is decided on points (a safety net against endless safety play)

/** One match. `step(dt)` thinks, strikes and rolls the balls; the score is the number of balls potted by each side. */
export class BilliardsSim implements GameSim {
  score: [number, number] = [0, 0];
  over = false;
  winner: 0 | 1 | null = null;
  balls: BBall[];
  turn: 0 | 1 = 0;
  groups: [Group | null, Group | null] = [null, null];
  phase: BilliardsPhase = "aim";
  /** The shot being lined up (for the cue stick in the scene). */
  aim: Plan = { angle: 0, strength: 1 };
  shots: [number, number] = [0, 0];
  note = "";
  readonly skill: [number, number];
  /** The seat you play (null = agents only), the keys you hold (dx +1 turns the cue right, dz +1 = less power) and your strength dial (1-9). */
  user: 0 | 1 | null = null;
  ctl = { dx: 0, dz: 0 };
  private dial = 5;
  private think = 1.2;
  private report: ShotReport = { potted: [], firstHit: null };
  private down = new Set<number>();
  private potBy: [number, number] = [0, 0];

  constructor(readonly variant: Variant, private rng: Rng, readonly target = VARIANTS[variant].target) {
    this.balls = rack(variant, rng);
    this.skill = [0.3 + rng() * 0.65, 0.3 + rng() * 0.65];
    this.turn = rng() < 0.5 ? 0 : 1;
    this.plan();
  }

  line(): string { return `${this.score[0]} : ${this.score[1]}`; }
  detail(): string {
    const g = this.groups[this.turn];
    return this.note || (this.variant === "eight" && g ? `${g}s` : "");
  }

  private legal = (id: number): boolean => {
    if (this.variant === "quick") return true;
    const g = this.groups[this.turn];
    if (g === null) return id !== 8;
    return kindOf(id) === g || (id === 8 && ownLeft(g, this.down) === 0);
  };

  setUser(seat: 0 | 1): void { this.user = seat; if (this.phase === "aim" && this.turn === seat) this.plan(); }
  /** It is your shot and the cue waits for you. */
  get yourTurn(): boolean { return this.user !== null && this.turn === this.user && this.phase === "aim" && !this.over; }
  /** Your power dial, 1-9. */
  get power(): number { return Math.round(this.dial); }

  private plan(): void {
    const mine = this.user === this.turn;
    this.aim = planShot(this.balls, this.legal, mine ? 1 : this.skill[this.turn], this.rng); // for you it is only a first suggestion: turn the cue as you like
    if (mine) { this.dial = this.aim.strength; this.think = Infinity; } else this.think = 0.9 + this.rng() * 1.1;
    this.phase = "aim";
  }

  /** You take the shot (Space / the button). */
  shoot(): void {
    if (!this.yourTurn) return;
    this.report = { potted: [], firstHit: null };
    strike(this.balls, this.aim.angle, this.power);
    this.shots[this.turn]++;
    this.phase = "roll";
  }

  step(dt: number): void {
    if (this.over) return;
    if (this.phase === "aim") {
      if (this.yourTurn) { // you: left/right turn the cue, up/down set the power
        this.aim = { angle: this.aim.angle + this.ctl.dx * 1.1 * dt, strength: this.dial };
        this.dial = Math.max(1, Math.min(MAX_STRENGTH, this.dial - this.ctl.dz * 3.5 * dt));
        this.aim.strength = this.power;
        return;
      }
      this.think -= dt;
      if (this.think <= 0) {
        this.report = { potted: [], firstHit: null };
        strike(this.balls, this.aim.angle, this.aim.strength);
        this.shots[this.turn]++;
        this.phase = "roll";
      }
      return;
    }
    stepBalls(this.balls, Math.min(dt, 0.1), this.report);
    if (!moving(this.balls)) this.settle();
  }

  /** Run the match to the end without a renderer: used by tests and anyone who wants a result fast. */
  playOut(maxSeconds = 4000): void { for (let t = 0; !this.over && t < maxSeconds; t += 1 / 30) this.step(1 / 30); }

  private settle(): void {
    const rep = this.report, me = this.turn;
    for (const id of rep.potted) this.down.add(id);
    const v = judgeShot({ variant: this.variant, turn: me, groups: this.groups, down: this.down }, rep);
    this.groups = v.groups;
    this.note = `${me === 0 ? "A" : "B"} ${v.note}`;
    if (this.variant === "quick") { if (!v.foul) this.potBy[me] += rep.potted.filter((i) => i !== CUE).length; this.score = [this.potBy[0], this.potBy[1]]; }
    else this.score = [0, 1].map((s) => { const g = this.groups[s]!; return g ? 7 - ownLeft(g, this.down) : 0; }) as [number, number];
    // the cue ball comes back: on the head spot (ball in hand for the other side after a foul), shifted if the spot is taken
    const cue = this.balls[0]!;
    if (cue.out) { cue.out = false; this.placeCue(cue); }
    let winner = v.winner;
    if (this.variant === "quick" && winner === null && this.score[me] >= this.target) winner = me;
    if (winner === null && (this.shots[0] >= SHOT_LIMIT && this.shots[1] >= SHOT_LIMIT || this.balls.every((b, i) => i === 0 || b.out))) winner = this.score[0] === this.score[1] ? me : this.score[0] > this.score[1] ? 0 : 1;
    if (winner !== null) { this.over = true; this.winner = winner; return; }
    this.turn = v.next;
    this.plan();
  }

  private placeCue(cue: BBall): void {
    cue.vx = cue.vz = 0;
    for (let k = 0; k < 40; k++) {
      cue.x = -TABLE.L / 4 - (k % 2 ? 1 : 0) * 0.02 * k; cue.z = ((k % 5) - 2) * 0.1 * (1 + Math.floor(k / 10));
      if (this.balls.every((b) => b === cue || b.out || Math.hypot(b.x - cue.x, b.z - cue.z) > BALL_R * 2 + 0.01)) return;
    }
  }
}
