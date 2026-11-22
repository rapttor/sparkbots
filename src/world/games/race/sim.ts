import { CAR, newCar, speedOf, stepCar, type CarInput, type CarState } from "./car";
import { gridSlot, pointAt, type Track } from "./track";
import type { Rng } from "../types";

/** One race on a track (13.7.10): cars, AI drivers, countdown, laps, ranking. Pure and deterministic given the rng. */
export interface Racer {
  id: string;
  name: string;
  color: string;
  user: boolean;          // driven from the keyboard
  car: CarState;
  input: CarInput;
  skill: number;          // 0.82..1: how close to the limit the AI drives
  lane: number;           // preferred offset from the centre line (m)
  prog: number;           // distance covered since the start line (negative on the grid)
  lap: number;            // laps completed
  finishedAt: number | null;
  out: boolean;           // retired (its agent went back to work)
}
export type RacePhase = "countdown" | "racing" | "over";

export const COUNTDOWN = 3;
export const MAX_CARS = 8;

const wrapDelta = (d: number, len: number): number => (d > len / 2 ? d - len : d < -len / 2 ? d + len : d);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export class RaceSim {
  racers: Racer[] = [];
  phase: RacePhase = "countdown";
  time = 0;               // since the lights went green (negative during the countdown)
  order: string[] = [];   // ids, current ranking
  constructor(public track: Track, private rng: Rng, public laps = 3) { this.time = -COUNTDOWN; }

  /** Add a car to the next free grid slot (only before the start). */
  add(id: string, name: string, color: string, user = false): Racer | null {
    if (this.phase !== "countdown" || this.racers.length >= MAX_CARS || this.racers.some((r) => r.id === id)) return null;
    const g = gridSlot(this.track, this.racers.length);
    const car = newCar(g.x, g.z, g.h);
    car.s = ((g.s % this.track.length) + this.track.length) % this.track.length;
    const r: Racer = { id, name, color, user, car, input: { throttle: 0, steer: 0, drift: false }, skill: 0.82 + this.rng() * 0.18, lane: (this.rng() - 0.5) * this.track.halfWidth * 0.8, prog: g.s, lap: 0, finishedAt: null, out: false };
    this.racers.push(r);
    this.rank();
    return r;
  }

  get(id: string): Racer | undefined { return this.racers.find((r) => r.id === id); }
  setInput(id: string, inp: Partial<CarInput>): void { const r = this.get(id); if (r) Object.assign(r.input, inp); }
  /** Hand a car to the keyboard (or back to the AI). */
  setUser(id: string, on: boolean): void { const r = this.get(id); if (r) { r.user = on; if (!on) r.input = { throttle: 0, steer: 0, drift: false }; } }
  retire(id: string): void { const r = this.get(id); if (r && r.finishedAt === null) r.out = true; }
  get over(): boolean { return this.phase === "over"; }

  /** Advance dt seconds, in sub-steps of at most 50 ms (a lagging frame must not break the physics). */
  step(dt: number): void {
    for (let left = Math.min(dt, 1); left > 1e-9 && this.phase !== "over"; left -= 0.05) this.tick(Math.min(left, 0.05));
  }

  private tick(h: number): void {
    this.time += h;
    if (this.phase === "countdown") { if (this.time >= 0) this.phase = "racing"; else return; }
    for (const r of this.racers) {
      if (r.out) continue;
      if (!r.user && r.finishedAt === null) this.drive(r);
      else if (r.finishedAt !== null) { r.input.throttle = -0.3; r.input.steer = 0; r.input.drift = false; } // roll out after the flag
      const prevS = r.car.s;
      stepCar(r.car, r.input, h, this.track);
      if (r.finishedAt === null) {
        r.prog += wrapDelta(r.car.s - prevS, this.track.length);
        r.lap = Math.max(0, Math.floor(r.prog / this.track.length));
        if (r.prog >= this.laps * this.track.length) r.finishedAt = this.time;
      }
    }
    this.separate();
    this.rank();
    const live = this.racers.filter((r) => !r.out);
    // over when every live car has finished; or a long time after the winner (stragglers and standing user cars do not hold things up)
    const winnerAt = Math.min(...this.racers.map((r) => r.finishedAt ?? Infinity));
    if (live.length === 0 || live.every((r) => r.finishedAt !== null) || this.time - winnerAt > 25) this.phase = "over";
  }

  /** The AI: steer at a point ahead on its own lane, brake for the bend it can see. */
  private drive(r: Racer): void {
    const t = this.track, c = r.car, sp = speedOf(c);
    const look = 5 + sp * 0.35;
    const a = pointAt(t, c.s + look), nx = -a.tz, nz = a.tx;
    const lane = clamp(r.lane, -(t.halfWidth - 1.4), t.halfWidth - 1.4);
    const tx = a.x + nx * lane, tz = a.z + nz * lane;
    let err = Math.atan2(tz - c.z, tx - c.x) - c.h;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    r.input.steer = clamp(err * 2.4, -1, 1);
    // bend ahead: heading change between two points further along
    const p1 = pointAt(t, c.s + 8), p2 = pointAt(t, c.s + 8 + 12 + sp);
    const bend = Math.abs(Math.atan2(Math.sin(Math.atan2(p2.tz, p2.tx) - Math.atan2(p1.tz, p1.tx)), Math.cos(Math.atan2(p2.tz, p2.tx) - Math.atan2(p1.tz, p1.tx))));
    const want = CAR.MAX * r.skill * (1 - 0.4 * clamp(bend / 1.2, 0, 1));
    const v = c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
    r.input.throttle = clamp((want - v) * 0.7, -1, 1);
    r.input.drift = r.skill > 0.92 && Math.abs(err) > 0.45 && sp > 10; // the best drivers slide through hard corners
  }

  /** Soft bumper cars: overlapping cars are pushed apart, so nobody drives through anyone. O(n^2) with n <= 8. */
  private separate(): void {
    const R = 1.5;
    for (let i = 0; i < this.racers.length; i++) for (let j = i + 1; j < this.racers.length; j++) {
      const a = this.racers[i]!.car, b = this.racers[j]!.car;
      if (this.racers[i]!.out || this.racers[j]!.out) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6) continue;
      const push = (R - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    }
  }

  private rank(): void {
    this.order = [...this.racers].sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (a.finishedAt !== null ? 0 : 1) - (b.finishedAt !== null ? 0 : 1) || (a.finishedAt !== null && b.finishedAt !== null ? a.finishedAt - b.finishedAt : b.prog - a.prog)).map((r) => r.id);
  }

  /** Final standings (finished cars by time, then the rest by distance). */
  standings(): Racer[] { return this.order.map((id) => this.get(id)!).filter((r) => !r.out); }
}
