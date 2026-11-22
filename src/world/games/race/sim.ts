import { newCar, speedOf, stepCar, type CarInput, type CarState } from "./car";
import { CAR_TYPES, type CarKind, type CarSpec } from "./carTypes";
import { genDecor, makeCrossers, stepCrossers, type Crosser, type Decor } from "./hazards";
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
  lapAt: number;          // race time when the current lap began
  lastLap: number | null;
  bestLap: number | null;
  bumps: number;          // car-to-car knocks
  out: boolean;           // retired (its agent went back to work)
  item: Item | null;      // what you hold; the action key uses it
  itemWait: number;       // AI: seconds before it uses the item
}
export type Item = "boost" | "missile" | "trap";
export const ITEMS: Item[] = ["boost", "missile", "trap"];
export const ITEM_ICON: Record<Item, string> = { boost: "⚡", missile: "🚀", trap: "🛢" };
export interface Missile { owner: string; s: number; lat: number; speed: number; age: number; target: string | null; x: number; z: number; h: number }
export interface Trap { x: number; z: number; age: number; owner: string }
export interface Boom { x: number; z: number; color: string }
export const MISSILE_SPEED = 32;
export const BOOST_TIME = 2.4;
export type RacePhase = "countdown" | "racing" | "over";

export const COUNTDOWN = 3;
export const MAX_CARS = 8;
export const CARMA_TIME = 240;

const wrapDelta = (d: number, len: number): number => (d > len / 2 ? d - len : d < -len / 2 ? d + len : d);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export class RaceSim {
  racers: Racer[] = [];
  phase: RacePhase = "countdown";
  time = 0;               // since the lights went green (negative during the countdown)
  order: string[] = [];   // ids, current ranking
  readonly spec: CarSpec;
  decor: Decor;
  crossers: Crosser[];
  missiles: Missile[] = [];
  traps: Trap[] = [];
  events: Boom[] = [];            // explosions since the renderer last looked
  pickupCd: number[] = [];        // per item box: seconds until it is back
  /** Carmageddon: your car has no road edge and no lap count; the race lasts CARMA_TIME seconds. */
  readonly carmageddon: boolean;
  constructor(public track: Track, private rng: Rng, public laps = 3, kind: CarKind = "race", carmageddon = false) {
    this.time = -COUNTDOWN; this.spec = CAR_TYPES[kind]; this.carmageddon = carmageddon;
    this.decor = genDecor(track, rng); this.crossers = makeCrossers(track, this.decor.crossAt, rng); this.pickupCd = this.decor.pickups.map(() => 0);
  }

  /** Add a car to the next free grid slot (only before the start). */
  add(id: string, name: string, color: string, user = false): Racer | null {
    if (this.phase !== "countdown" || this.racers.length >= MAX_CARS || this.racers.some((r) => r.id === id)) return null;
    const g = gridSlot(this.track, this.racers.length);
    const car = newCar(g.x, g.z, g.h);
    car.s = ((g.s % this.track.length) + this.track.length) % this.track.length;
    const r: Racer = { id, name, color, user, car, input: { throttle: 0, steer: 0, drift: false }, skill: 0.82 + this.rng() * 0.18, lane: (this.rng() - 0.5) * this.track.halfWidth * 0.8, prog: g.s, lap: 0, finishedAt: null, lapAt: 0, lastLap: null, bestLap: null, bumps: 0, out: false, item: null, itemWait: 0 };
    this.racers.push(r);
    this.rank();
    return r;
  }

  /** Whether this car's own item is worth using now: the AI's judgement. */
  private aiUse(r: Racer, bend: number): void {
    if (!r.item || this.phase !== "racing") return;
    r.itemWait -= 0.016;
    if (r.itemWait > 0) return;
    const ahead = this.racers.some((o) => o !== r && !o.out && o.prog - r.prog > 4 && o.prog - r.prog < 40 && Math.abs(o.car.lat - r.car.lat) < 3.5);
    const behind = this.racers.some((o) => o !== r && !o.out && r.prog - o.prog > 3 && r.prog - o.prog < 18);
    if (r.item === "boost" ? bend < 0.25 : r.item === "missile" ? ahead : behind) this.useItem(r.id);
    else if (r.itemWait < -12) this.useItem(r.id);
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
      const prevS = r.car.s, free = this.carmageddon && r.user;
      stepCar(r.car, r.input, h, this.track, this.spec, free);
      if (free) this.keepNear(r.car);
      else this.hazards(r, h);
      this.pickups(r);
      if (r.finishedAt === null && !free) {
        r.prog += wrapDelta(r.car.s - prevS, this.track.length);
        const lap = Math.max(0, Math.floor(r.prog / this.track.length));
        if (lap > r.lap) { r.lastLap = this.time - r.lapAt; r.bestLap = r.bestLap === null ? r.lastLap : Math.min(r.bestLap, r.lastLap); r.lapAt = this.time; }
        r.lap = lap;
        if (r.prog >= this.laps * this.track.length) r.finishedAt = this.time;
      }
    }
    stepCrossers(this.track, this.crossers, h, this.rng);
    this.stepWeapons(h);
    for (let i = 0; i < this.pickupCd.length; i++) if (this.pickupCd[i]! > 0) this.pickupCd[i] = this.pickupCd[i]! - h;
    this.separate();
    this.rank();
    if (this.carmageddon) { if (this.time > CARMA_TIME || !this.racers.some((r) => r.user && !r.out)) this.phase = "over"; return; }
    const live = this.racers.filter((r) => !r.out);
    // over when every live car has finished; or a long time after the winner (stragglers and standing user cars do not hold things up)
    const winnerAt = Math.min(...this.racers.map((r) => r.finishedAt ?? Infinity));
    if (live.length === 0 || live.every((r) => r.finishedAt !== null) || this.time - winnerAt > 25) this.phase = "over";
  }

  /** Potholes slow you down, oil takes your grip away, a mini robot in the way is knocked flat (and slows you a little). */
  private hazards(r: Racer, dt: number): void {
    const c = r.car, rad = this.spec.radius;
    for (const hz of this.decor.hazards) {
      if (Math.abs(hz.s - c.s) > 6 && Math.abs(hz.s - c.s) < this.track.length - 6) continue;
      if (Math.hypot(hz.x - c.x, hz.z - c.z) > hz.r + rad * 0.6) continue;
      if (hz.kind === "oil") c.slick = 1.1;
      else if (c.cool <= 0) { c.cool = 0.7; c.vx *= 0.55; c.vz *= 0.55; }
    }
    for (const k of this.crossers) {
      if (k.phase !== "run" && k.phase !== "wait") continue;
      if (Math.hypot(k.x - c.x, k.z - c.z) < rad + 0.35) { k.phase = "flat"; k.timer = 2.5; c.vx *= 0.7; c.vz *= 0.7; }
    }
    for (const tr of this.traps) if (Math.hypot(tr.x - c.x, tr.z - c.z) < 1.9 && (tr.age > 1.2 || tr.owner !== r.id)) c.slick = 1.1;
    void dt;
  }

  /** Driving over an item box gives you an item if your hands are empty; the box is back a few seconds later. */
  private pickups(r: Racer): void {
    if (r.item !== null) return;
    const c = r.car, list = this.decor.pickups;
    for (let i = 0; i < list.length; i++) {
      if (this.pickupCd[i]! > 0 || Math.abs(list[i]!.s - c.s) > 4) continue;
      if (Math.hypot(list[i]!.x - c.x, list[i]!.z - c.z) > this.spec.radius + 1) continue;
      this.pickupCd[i] = 8;
      r.item = ITEMS[Math.floor(this.rng() * ITEMS.length)]!;
      r.itemWait = 0.8 + this.rng() * 2.2;
      return;
    }
  }

  /** The action key: boost, shoot a missile (it follows the road and homes in on the car ahead) or drop an oil slick behind you. */
  useItem(id: string): boolean {
    const r = this.get(id);
    if (!r || r.out || !r.item || this.phase !== "racing") return false;
    const c = r.car, it = r.item;
    r.item = null;
    if (it === "boost") c.boost = BOOST_TIME;
    else if (it === "trap") this.traps.push({ x: c.x - Math.cos(c.h) * 2.4, z: c.z - Math.sin(c.h) * 2.4, age: 0, owner: id });
    else {
      let target: string | null = null, best = 70;
      for (const o of this.racers) { const gap = o.prog - r.prog; if (o !== r && !o.out && gap > 0 && gap < best) { best = gap; target = o.id; } }
      this.missiles.push({ owner: id, s: c.s + 3, lat: c.lat, speed: MISSILE_SPEED, age: 0, target, x: c.x, z: c.z, h: c.h });
    }
    return true;
  }

  private stepWeapons(dt: number): void {
    const t = this.track;
    for (const tr of this.traps) tr.age += dt;
    this.traps = this.traps.filter((x) => x.age < 25);
    for (const m of [...this.missiles]) {
      m.age += dt; m.s += m.speed * dt;
      const tg = m.target ? this.get(m.target) : undefined;
      if (tg && !tg.out) m.lat += Math.max(-4 * dt, Math.min(4 * dt, tg.car.lat - m.lat));
      const p = pointAt(t, m.s);
      m.x = p.x - p.tz * m.lat; m.z = p.z + p.tx * m.lat; m.h = Math.atan2(p.tz, p.tx);
      let hit: Racer | null = null;
      if (m.age > 0.15) for (const o of this.racers) if (o.id !== m.owner && !o.out && Math.hypot(o.car.x - m.x, o.car.z - m.z) < this.spec.radius + 0.9) { hit = o; break; }
      if (hit) {
        hit.car.vx *= 0.25; hit.car.vz *= 0.25; hit.car.h += (this.rng() - 0.5) * 1.8; hit.car.slick = 1.2; hit.car.boost = 0; hit.bumps++;
        this.events.push({ x: m.x, z: m.z, color: "#ff9a2e" });
        this.missiles = this.missiles.filter((x) => x !== m);
      } else if (m.age > 4) this.missiles = this.missiles.filter((x) => x !== m);
    }
  }

  /** Carmageddon: drive anywhere, but not off the edge of the world. */
  private keepNear(c: CarState): void {
    const R = this.track.rect, m = 45;
    c.x = Math.max(R.x0 - m, Math.min(R.x1 + m, c.x)); c.z = Math.max(R.z0 - m, Math.min(R.z1 + m, c.z));
  }

  /** The AI: steer at a point ahead on its own lane, brake for the bend it can see. */
  private drive(r: Racer): void {
    const t = this.track, c = r.car, sp = speedOf(c);
    const look = 5 + sp * 0.35, max = this.spec.maxSpeed;
    const a = pointAt(t, c.s + look), nx = -a.tz, nz = a.tx;
    const lane = clamp(r.lane, -(t.halfWidth - 1.4), t.halfWidth - 1.4);
    const tx = a.x + nx * lane, tz = a.z + nz * lane;
    let err = Math.atan2(tz - c.z, tx - c.x) - c.h;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    r.input.steer = clamp(err * 2.4, -1, 1);
    // bend ahead: how sharp, then the speed the tyres can hold through it (the AI does not always get it right)
    const span = 12 + sp, p1 = pointAt(t, c.s + 8), p2 = pointAt(t, c.s + 8 + span);
    const dh = Math.atan2(p2.tz, p2.tx) - Math.atan2(p1.tz, p1.tx), bend = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));
    const curv = Math.max(bend / span, 1e-3), vBend = Math.sqrt((this.spec.cornerG * (0.55 + 0.45 * r.skill)) / curv);
    const want = Math.min(max * r.skill, Math.max(vBend, max * 0.35));
    const v = c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
    r.input.throttle = clamp((want - v) * 0.7, -1, 1);
    this.aiUse(r, bend);
    r.input.drift = r.skill > 0.95 && Math.abs(err) > 0.5 && sp > max * 0.7; // the best drivers slide through hard corners
  }

  /** Bumper cars: overlapping cars are pushed apart, bounce off each other a little and both lose some speed. O(n^2) with n <= 8. */
  private separate(): void {
    const R = this.spec.radius * 1.7;
    for (let i = 0; i < this.racers.length; i++) for (let j = i + 1; j < this.racers.length; j++) {
      const ra = this.racers[i]!, rb = this.racers[j]!;
      if (ra.out || rb.out) continue;
      const a = ra.car, b = rb.car, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6) continue;
      const push = (R - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // > 0: closing
      if (vn > 0) {
        const j2 = vn * 0.7; // equal masses, a bit bouncy
        a.vx -= nx * j2; a.vz -= nz * j2; b.vx += nx * j2; b.vz += nz * j2;
        const loss = Math.max(0.9, 1 - vn * 0.012); // a knock costs speed
        a.vx *= loss; a.vz *= loss; b.vx *= loss; b.vz *= loss;
        if (vn > 1.5) { ra.bumps++; rb.bumps++; }
      }
    }
  }

  private rank(): void {
    this.order = [...this.racers].sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (a.finishedAt !== null ? 0 : 1) - (b.finishedAt !== null ? 0 : 1) || (a.finishedAt !== null && b.finishedAt !== null ? a.finishedAt - b.finishedAt : b.prog - a.prog)).map((r) => r.id);
  }

  /** Final standings (finished cars by time, then the rest by distance). */
  standings(): Racer[] { return this.order.map((id) => this.get(id)!).filter((r) => !r.out); }
}
