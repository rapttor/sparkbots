import type { GameSim, Rng } from "./types";

/** The playing field, in table units (the same for every large table, the built-in ping-pong table included). */
export const TABLE = { L: 2.7, W: 1.5 };
const GOAL_HALF = 0.28;       // air hockey: half the width of the goal in the middle of each end
const DEPTH_MAX = 1.2;        // pong: how far behind the table end a player can stand

export interface Paddle { x: number; z: number; depth: number; targetDepth: number; skill: number; swing: number; err: number }
export interface Ball { x: number; z: number; vx: number; vz: number }

/**
 * Pong (table tennis) and air hockey on one table, side 0 at -x and side 1 at +x. Both are played by "proximity": you hit
 * only when the ball is within reach of you.
 *  - pong: you stand behind the end of the table; the further back you stand, the harder you hit, but the smaller your reach.
 *    You drift forward and back as a tactic. A ball you cannot reach is a point for the other side.
 *  - hockey: the puck bounces off the edges; strike it towards the centre of the other end (the goal). The closer you hit it
 *    (the less your mallet is stretched), the more accurate.
 */
export class RallySim implements GameSim {
  score: [number, number] = [0, 0];
  over = false;
  winner: 0 | 1 | null = null;
  ball: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  paddles: [Paddle, Paddle];
  /** Seconds left until the next serve. */
  pause = 0.8;
  /** Counts up on every hit, for the visuals (flash) and tests. */
  hits = 0;
  lastHit: 0 | 1 | null = null;
  /** The seat you play (null = agents only) and the keys you hold: dx +1 = right, dz +1 = towards the camera (south). */
  user: 0 | 1 | null = null;
  ctl = { dx: 0, dz: 0 };
  private server: 0 | 1 = 0;
  private cool = 0;

  constructor(readonly mode: "pong" | "hockey", private rng: Rng, readonly target = 5) {
    const mk = (side: 0 | 1): Paddle => {
      const dir = side === 0 ? -1 : 1;
      return { x: dir * (TABLE.L / 2 - 0.35), z: 0, depth: 0.4, targetDepth: 0.4, skill: 0.35 + rng() * 0.6, swing: 0, err: 0 };
    };
    this.paddles = [mk(0), mk(1)];
    this.server = rng() < 0.5 ? 0 : 1;
    this.serve();
  }

  line(): string { return `${this.score[0]} : ${this.score[1]}`; }

  detail(): string { return ""; }

  setUser(seat: 0 | 1): void { this.user = seat; this.paddles[seat].skill = 0.9; this.paddles[seat].depth = this.paddles[seat].targetDepth = 0.5; }

  private serve(): void {
    const dir = this.server === 0 ? 1 : -1;
    const sp = this.mode === "pong" ? 2.2 : 2.6;
    this.ball = { x: this.mode === "pong" ? dir * -(TABLE.L / 2 - 0.2) : 0, z: (this.rng() - 0.5) * 0.5, vx: dir * sp, vz: (this.rng() - 0.5) * 1.4 };
    this.pause = 0.9;
    this.cool = 0;
  }

  private point(to: 0 | 1): void {
    this.score[to]++;
    this.server = to === 0 ? 1 : 0; // the side that lost the point serves
    if (this.score[to] >= this.target) { this.over = true; this.winner = to; this.ball.vx = this.ball.vz = 0; return; }
    this.serve();
  }

  step(dt: number): void {
    if (this.over) return;
    if (this.pause > 0) { this.pause -= dt; this.tidyPaddles(dt); return; }
    this.cool = Math.max(0, this.cool - dt);
    if (this.mode === "pong") this.stepPong(dt); else this.stepHockey(dt);
  }

  // ---- pong ---------------------------------------------------------------------------------------------------------
  /** How far the ball can be from you (sideways) and still be hit; shrinks as you stand further back. */
  reach(depth: number): number { return 0.5 - 0.2 * (depth / DEPTH_MAX); }

  private stepPong(dt: number): void {
    const b = this.ball, half = TABLE.W / 2 - 0.04;
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (b.z > half) { b.z = half; b.vz = -Math.abs(b.vz); } else if (b.z < -half) { b.z = -half; b.vz = Math.abs(b.vz); }
    // every player follows the ball sideways (limited speed) and moves tactically forward/back
    for (const side of [0, 1] as const) {
      const p = this.paddles[side];
      if (this.user === side) { // you: sideways with up/down, back and forth with left/right (further back = harder hit, smaller reach)
        p.z = Math.max(-TABLE.W / 2, Math.min(TABLE.W / 2, p.z + this.ctl.dz * 1.9 * dt));
        p.depth = Math.max(0, Math.min(DEPTH_MAX, p.depth + (side === 0 ? -1 : 1) * this.ctl.dx * 0.7 * dt));
        p.swing = Math.max(0, p.swing - dt * 4);
        continue;
      }
      const toward = side === 0 ? b.vx < 0 : b.vx > 0;
      const speed = 0.9 + p.skill * 1.3;
      const want = toward ? b.z + p.err : b.z * 0.3; // the error is how well this player read the shot
      p.z += Math.max(-speed * dt, Math.min(speed * dt, want - p.z));
      p.depth += Math.max(-0.5 * dt, Math.min(0.5 * dt, p.targetDepth - p.depth));
      p.swing = Math.max(0, p.swing - dt * 4);
    }
    const lineX = TABLE.L / 2 - 0.05;
    for (const side of [0, 1] as const) {
      const out = side === 0 ? b.x < -lineX && b.vx < 0 : b.x > lineX && b.vx > 0;
      if (!out || this.cool > 0) continue;
      const p = this.paddles[side], d = Math.abs(p.z - b.z);
      if (d <= this.reach(p.depth)) { this.hitPong(side, d); return; }
      if (Math.abs(b.x) > TABLE.L / 2 + 0.45) { this.point(side === 0 ? 1 : 0); return; }
    }
  }

  private hitPong(side: 0 | 1, miss: number): void {
    const p = this.paddles[side], b = this.ball, dir = side === 0 ? 1 : -1;
    const speed = 1.7 + 1.6 * (p.depth / DEPTH_MAX);                       // further back = harder
    const err = (this.rng() - 0.5) * (0.5 + miss * 2.5);                   // a stretched hit is less accurate
    b.vx = dir * speed; b.vz = (this.rng() - 0.5) * speed * 0.9 + err;
    b.x = dir * -(TABLE.L / 2 - 0.06);
    p.swing = 1; this.hits++; this.lastHit = side; this.cool = 0.15;
    if (this.user !== side) p.targetDepth = this.rng() * DEPTH_MAX;
    // the other side has to read a harder, more wildly aimed shot: worse for weaker players
    const o = this.paddles[side === 0 ? 1 : 0], hard = Math.min(1, (speed - 1.7) / 1.6 + Math.abs(b.vz) / 3);
    o.err = (this.rng() * 2 - 1) * (0.25 + 0.6 * hard) * (1.3 - o.skill);                                // new tactic: come close or back off
  }

  // ---- air hockey ---------------------------------------------------------------------------------------------------
  private stepHockey(dt: number): void {
    const b = this.ball;
    // puck: friction (tiny) and a minimum speed so the game never stalls
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) { const k = Math.max(sp * (1 - 0.12 * dt), 0.7) / sp; b.vx *= k; b.vz *= k; }
    b.x += b.vx * dt; b.z += b.vz * dt;
    const hw = TABLE.W / 2 - 0.04, hl = TABLE.L / 2;
    if (b.z > hw) { b.z = hw; b.vz = -Math.abs(b.vz) * 0.95; } else if (b.z < -hw) { b.z = -hw; b.vz = Math.abs(b.vz) * 0.95; }
    if (Math.abs(b.x) >= hl) {
      if (Math.abs(b.z) <= GOAL_HALF) { this.point(b.x > 0 ? 0 : 1); return; } // through the centre of the end: that is a goal for the other side
      b.x = Math.sign(b.x) * hl; b.vx = -Math.sign(b.x) * Math.abs(b.vx) * 0.95;
    }
    for (const side of [0, 1] as const) {
      const p = this.paddles[side], dir = side === 0 ? -1 : 1;
      const inOwnHalf = b.x * dir > -0.1;
      const speed = 1.1 + p.skill * 1.5;
      if (this.user === side) { // you steer the mallet with the arrows / WASD
        p.x += this.ctl.dx * 2.0 * dt; p.z += this.ctl.dz * 2.0 * dt;
      } else {
      // attack when the puck is on our side, otherwise guard the goal
      const tx = inOwnHalf ? b.x : dir * (hl - 0.35), tz = inOwnHalf ? b.z : b.z * 0.4;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, speed * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      }
      p.x = dir > 0 ? Math.max(0.05, Math.min(hl - 0.2, p.x)) : Math.min(-0.05, Math.max(-(hl - 0.2), p.x));
      p.z = Math.max(-hw + 0.05, Math.min(hw - 0.05, p.z));
      p.swing = Math.max(0, p.swing - dt * 4);
      const dist = Math.hypot(b.x - p.x, b.z - p.z);
      if (dist < 0.2 && this.cool <= 0) this.strike(side, dist);
    }
  }

  private strike(side: 0 | 1, dist: number): void {
    const p = this.paddles[side], b = this.ball, dir = side === 0 ? 1 : -1;
    // aim at the centre of the other end; being off-centre (a stretched strike) adds error to the angle
    const tx = dir * (TABLE.L / 2), ang = Math.atan2(0 - b.z, tx - b.x) + (this.rng() - 0.5) * (0.15 + dist * 4) * (1.3 - p.skill);
    const speed = 2.3 + this.rng() * 1.2 + Math.abs(b.x - dir * (TABLE.L / 2)) * 0.5; // further from the target = harder
    b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed;
    if (b.vx * dir < 0.5) b.vx = dir * 0.5; // never back into our own goal
    p.swing = 1; this.hits++; this.lastHit = side; this.cool = 0.25;
  }

  private tidyPaddles(dt: number): void {
    for (const p of this.paddles) p.swing = Math.max(0, p.swing - dt * 4);
  }
}
