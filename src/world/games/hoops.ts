import type { GameSim, Rng } from "./types";

/**
 * Basketball timing game, pure. The two players take turns; every shot is three presses on a moving meter:
 *  1. ANGLE: a marker sweeps 0..1 and back; stop it near the sweet spot,
 *  2. POWER: the same for strength,
 *  3. SHOT: the ball flies a real parabola to the hoop (swish = 3, in = 2, rim rattle = maybe).
 * Every shot makes the meters faster ("speed-up"), so timing errors grow; a drone fetches the ball and hands it to the next player.
 * Local coordinates: the shooter stands at z = ±SHOOT_DIST of the hoop (x = 0), y is up.
 */
export const SHOOT_DIST = 0.95;
export const HOOP_Y = 1.5;
export const HAND_Y = 1.05;
export const RIM_R = 0.16;
const G = 9.81;
const ANGLE_MIN = 25 * Math.PI / 180, ANGLE_MAX = 80 * Math.PI / 180;
const SWEET_ANGLE = 58 * Math.PI / 180;
const V_MIN = 1.5, V_MAX = 6.5;

export const angleOf = (meter: number): number => ANGLE_MIN + (ANGLE_MAX - ANGLE_MIN) * clamp01(meter);
export const speedOf = (meter: number): number => V_MIN + (V_MAX - V_MIN) * clamp01(meter);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** The meters that give a perfect shot. */
export const SWEET_ANGLE_METER = (SWEET_ANGLE - ANGLE_MIN) / (ANGLE_MAX - ANGLE_MIN);
export const SWEET_POWER_METER = (() => {
  const dy = HOOP_Y - HAND_Y, v = Math.sqrt(G * SHOOT_DIST * SHOOT_DIST / (2 * Math.cos(SWEET_ANGLE) ** 2 * (SHOOT_DIST * Math.tan(SWEET_ANGLE) - dy)));
  return (v - V_MIN) / (V_MAX - V_MIN);
})();

/** Triangle wave: a meter running at `speed` (sweeps per second) is at this value `t` seconds after it started (0 -> 1 -> 0 ...). */
export const meterAt = (t: number, speed: number): number => { const p = (t * speed) % 2; return p <= 1 ? p : 2 - p; };

export interface Shot {
  angleMeter: number; powerMeter: number;
  /** Distance past (+) or short of (-) the hoop centre when the ball comes down through hoop height; null = never gets there. */
  miss: number | null;
  result: "swish" | "in" | "rim" | "miss";
  /** Seconds until the ball reaches hoop height going down (for the animation). */
  tHoop: number;
}

/** Ballistic height/distance of a shot at time t after release: [horizontal distance travelled, height]. */
export function flightAt(angle: number, v: number, t: number): [number, number] { return [v * Math.cos(angle) * t, HAND_Y + v * Math.sin(angle) * t - G * t * t / 2]; }

/** Judge a shot from the two meter values. `rattle` (0..1) decides a rim shot: it drops in when below 0.5. */
export function judgeShotMeters(angleMeter: number, powerMeter: number, rattle: number): Shot {
  const a = angleOf(angleMeter), v = speedOf(powerMeter), dy = HOOP_Y - HAND_Y;
  const vy = v * Math.sin(a), disc = vy * vy - 2 * G * dy;
  if (disc < 0) return { angleMeter, powerMeter, miss: null, result: "miss", tHoop: vy / G }; // never reaches hoop height
  const t = (vy + Math.sqrt(disc)) / G; // the descending crossing
  const miss = v * Math.cos(a) * t - SHOOT_DIST;
  const e = Math.abs(miss);
  const result = e < RIM_R * 0.45 ? "swish" : e < RIM_R * 0.85 ? "in" : e < RIM_R * 1.5 ? (rattle < 0.5 ? "in" : "rim") : "miss";
  return { angleMeter, powerMeter, miss, result, tHoop: t };
}
export const points = (r: Shot["result"]): number => (r === "swish" ? 3 : r === "in" ? 2 : 0);

export type HoopPhase = "angle" | "power" | "flight" | "fetch";
const MAX_ROUNDS = 25;
export const FETCH_TIME = 1.2;

/**
 * The match: both players shoot once per round; once someone has `target` points at the end of a round with a lead, they win
 * (a tie goes on; after MAX_ROUNDS the leader wins, a dead tie goes to a coin flip so a match always ends).
 */
export class HoopsSim implements GameSim {
  score: [number, number] = [0, 0];
  over = false;
  winner: 0 | 1 | null = null;
  shooter: 0 | 1 = 0;
  phase: HoopPhase = "angle";
  /** Meter speed (sweeps per second); grows every shot. */
  speed = 0.7;
  round = 1;
  /** Current meter readings (0..1) for the UI / marker; frozen once stopped. */
  meterA = 0; meterP = 0;
  shot: Shot | null = null;
  /** Time into the current phase. */
  t = 0;
  note = "";
  readonly skill: [number, number];
  private stopAt = 0;
  private aimedA = 0;
  private shotsInRound = 0;

  constructor(private rng: Rng, readonly target = 11) {
    this.skill = [0.25 + rng() * 0.7, 0.25 + rng() * 0.7];
    this.shooter = rng() < 0.5 ? 0 : 1;
    this.begin();
  }

  line(): string { return `${this.score[0]} : ${this.score[1]}`; }
  detail(): string { return this.note; }

  /** The marker positions the scene draws. */
  meter(): number { return this.phase === "angle" || this.phase === "power" ? meterAt(Math.min(this.t, this.stopAt), this.speed) : 0; }

  /** Where the ball is (local x=0 plane, shooter side): [z toward the hoop (signed to the shooter), y]; during a fetch the drone carries it. */
  ballPos(): { z: number; y: number } {
    const side = this.shooter === 0 ? -1 : 1;
    if (this.phase === "flight" && this.shot) {
      const a = angleOf(this.shot.angleMeter), v = speedOf(this.shot.powerMeter);
      const [d, y] = flightAt(a, v, this.t);
      return { z: side * (SHOOT_DIST - d), y: Math.max(0.1, y) };
    }
    if (this.phase === "fetch") { const k = Math.min(1, this.t / FETCH_TIME); const f = this.fetchFrom; return { z: f.z + (-side * SHOOT_DIST - f.z) * k, y: f.y + (HAND_Y + 0.35 - f.y) * k }; }
    return { z: side * SHOOT_DIST, y: HAND_Y };
  }
  /** The drone hovers over the ball while fetching and idles by the hoop otherwise. */
  dronePos(): { z: number; y: number } {
    if (this.phase === "fetch") { const b = this.ballPos(); return { z: b.z, y: b.y + 0.2 }; }
    return { z: 0, y: HOOP_Y + 0.55 };
  }
  private fetchFrom = { z: 0, y: 0.1 };
  /** The seat you play (null = agents only). Your meter runs until you press (Space / the button). */
  user: 0 | 1 | null = null;
  setUser(seat: 0 | 1): void { this.user = seat; if (this.shooter === seat && (this.phase === "angle" || this.phase === "power")) this.stopAt = Infinity; }
  /** It is your shot and the meter waits for you to stop it. */
  get yourTurn(): boolean { return this.user !== null && this.shooter === this.user && (this.phase === "angle" || this.phase === "power") && !this.over; }
  /** Stop the meter (first press fixes the angle, the second the power and the ball flies). */
  press(): void {
    if (!this.yourTurn) return;
    const m = meterAt(this.t, this.speed);
    if (this.phase === "angle") { this.meterA = m; this.aimedA = m; this.phase = "power"; this.t = 0; this.stopAt = Infinity; }
    else { this.meterP = m; this.release(); }
  }

  private begin(): void {
    this.phase = "angle"; this.t = 0; this.meterA = this.meterP = 0; this.shot = null;
    this.stopAt = this.user === this.shooter ? Infinity : this.planStop(SWEET_ANGLE_METER);
    this.aimedA = 0;
  }

  /** AI: when to press the stop key so the meter lands near `want`. Reaction jitter is in seconds, so a faster meter costs accuracy. */
  private planStop(want: number): number {
    const sk = this.skill[this.shooter], jitter = (1 - sk) * 0.14 + 0.02;
    const g = Math.sqrt(-2 * Math.log(1 - this.rng())) * Math.cos(2 * Math.PI * this.rng());
    const first = want / this.speed; // first time the rising meter hits `want`
    return Math.max(0.05, Math.min(1 / this.speed, first + g * jitter));
  }

  step(dt: number): void {
    if (this.over) return;
    this.t += dt;
    if (this.phase === "angle" || this.phase === "power") {
      if (this.t >= this.stopAt) {
        const m = meterAt(this.stopAt, this.speed);
        if (this.phase === "angle") { this.meterA = m; this.aimedA = m; this.phase = "power"; this.t = 0; this.stopAt = this.user === this.shooter ? Infinity : this.planStop(SWEET_POWER_METER); }
        else { this.meterP = m; this.release(); }
      }
    } else if (this.phase === "flight") {
      if (this.t >= (this.shot?.tHoop ?? 0) + 0.45) { this.land(); }
    } else if (this.t >= FETCH_TIME) {
      this.nextShooter();
    }
  }

  playOut(maxSeconds = 3000): void { for (let t = 0; !this.over && t < maxSeconds; t += 1 / 30) this.step(1 / 30); }

  private release(): void {
    this.shot = judgeShotMeters(this.aimedA, this.meterP, this.rng());
    this.phase = "flight"; this.t = 0;
  }

  private land(): void {
    const s = this.shot!, who = this.shooter, p = points(s.result);
    this.score[who] += p;
    this.note = `${who === 0 ? "A" : "B"}: ${s.result === "swish" ? "swish +3" : s.result === "in" ? "bucket +2" : s.result === "rim" ? "rim, no good" : "miss"}`;
    this.speed = Math.min(2, this.speed * 1.06); // speed-up
    const b = this.ballPos();
    this.fetchFrom = { z: b.z, y: b.y };
    this.phase = "fetch"; this.t = 0;
  }

  private nextShooter(): void {
    this.shotsInRound++;
    if (this.shotsInRound >= 2) {
      this.shotsInRound = 0;
      const [a, b] = this.score;
      if ((a >= this.target || b >= this.target) && a !== b) { this.finish(a > b ? 0 : 1); return; }
      if (this.round++ >= MAX_ROUNDS) { this.finish(a === b ? (this.rng() < 0.5 ? 0 : 1) : a > b ? 0 : 1); return; }
    }
    this.shooter = this.shooter === 0 ? 1 : 0;
    this.begin();
  }

  private finish(w: 0 | 1): void { this.over = true; this.winner = w; }
}
