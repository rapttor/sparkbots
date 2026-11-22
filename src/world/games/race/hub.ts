import { RaceSim, type Racer } from "./sim";
import type { CarKind } from "./carTypes";
import type { Track } from "./track";
import type { GameResult, Rng } from "../types";

/** What the race hub needs from the world (the agents); faked in tests. */
export interface RaceEnv {
  rng: Rng;
  /** Agents that may drive right now: idle (not working, not waiting). */
  idle(): string[];
  /** Is the agent still idle? A car whose agent went back to work retires at once. */
  alive(agent: string): boolean;
  name(agent: string): string;
  color(agent: string): string;
  /** Optional: store a finished result (the rankings). Only agents are recorded, never you or the pit bots. */
  record?(r: GameResult): void;
}

/** A finished race as rankings rows: every agent beats each agent that finished below it (a pair per two agents; `standings` best first). */
export function raceResults(standings: { id: string; name: string }[], uuid: string, at: number): GameResult[] {
  const ag = standings.filter((r) => r.id !== USER_ID && !r.id.startsWith("pit"));
  const out: GameResult[] = [];
  for (let i = 0; i < ag.length; i++) for (let j = i + 1; j < ag.length; j++) {
    const a = ag[i]!, b = ag[j]!;
    out.push({ uuid: `${uuid}:${i}-${j}`, at, game: "race", a: a.id, b: b.id, aName: a.name, bName: b.name, scoreA: ag.length - i, scoreB: ag.length - j, winner: a.id });
  }
  return out;
}

export const USER_ID = "user";
export const MIN_AUTO = 3;        // idle agents needed before a race starts by itself
export const OVER_SHOW = 10;      // s the results stay up
export const LAPS = 3;
const FILLER_COLORS = ["#4cc9f0", "#f72585", "#b5e48c", "#ffb703", "#9d4edd", "#2ec4b6", "#ef476f"];

/**
 * Owns the one race of the campus: starts it when idle agents get bored (or you join), runs it, drops cars whose agent went
 * back to work and shows the results for a while. Pure: it talks to the world through `RaceEnv`. Nothing runs without a race.
 */
export class RaceHub {
  track: Track | null = null;
  sim: RaceSim | null = null;
  auto = true;
  version = 0;
  /** What the next race uses (the car type is the same for everyone) and whether it is a carmageddon race (off by default). */
  kind: CarKind = "race";
  carmageddon = false;
  /** How many cars start (you included; empty places are filled with pit bots down to a field of 3) and whether item boxes are on the road. */
  cars = 7;
  items = true;
  /** Agents run over in this carmageddon race. */
  squashed = 0;
  /** Standings of the last finished race (names, in order), for the overlay. */
  last: { name: string; time: number | null }[] = [];
  private t = 0;
  private overFor = 0;
  private autoIn = 20;
  private listeners = new Set<() => void>();
  constructor(private env: RaceEnv) {}

  setEnv(env: RaceEnv): void { this.env = env; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(): void { this.version++; for (const l of this.listeners) l(); }

  /** The loop changed (the layout did): a running race is off. */
  setTrack(t: Track | null): void {
    const same = !!this.track && !!t && this.track.length === t.length && this.track.xs[0] === t.xs[0] && this.track.zs[0] === t.zs[0];
    if (same) return;
    this.track = t;
    if (this.sim) this.stop();
  }

  get running(): boolean { return this.sim !== null; }
  /** The car you drive: your own gold one, or an agent's / pit bot's car you took over. */
  userId: string | null = null;
  get userRacing(): boolean { const r = this.userId ? this.sim?.get(this.userId) : undefined; return !!r && !r.out; }
  /** Someone ran over an agent. */
  squash(): void { this.squashed++; this.changed(); }
  /** Idle agents that could drive. */
  candidates(): string[] { return this.env.idle(); }

  /** Start a race with idle agents, optionally with you in it (then pit bots fill the grid up to three cars). False if impossible. */
  start(withUser = false, color = "#ffd166"): boolean {
    this.squashed = 0;
    if (this.sim || !this.track) return false;
    const idle = this.candidates();
    if (!withUser && idle.length < 2) return false;
    const carma = this.carmageddon && withUser; // carmageddon needs you behind the wheel
    const sim = new RaceSim(this.track, this.env.rng, LAPS, this.kind, carma);
    if (withUser) sim.add(USER_ID, "You", color, true);
    const pool = [...idle];
    const used = new Map<string, number>();
    const uniq = (n: string): string => { const k = (used.get(n) ?? 0) + 1; used.set(n, k); return k === 1 ? n : `${n} ${k}`; }; // two "Untitled" must not look the same in the list
    sim.itemsOn = this.items;
    while (pool.length && sim.racers.length < Math.max(2, Math.min(this.cars, 8))) { const [a] = pool.splice(Math.floor(this.env.rng() * pool.length), 1); sim.add(a!, uniq(this.env.name(a!)), this.env.color(a!)); }
    for (let k = 0; sim.racers.length < Math.max(2, Math.min(this.cars, 3)); k++) sim.add(`pit${k}`, `Pit bot ${k + 1}`, FILLER_COLORS[k % FILLER_COLORS.length]!);
    this.sim = sim; this.overFor = 0; this.last = []; this.userId = withUser ? USER_ID : null;
    this.changed();
    return true;
  }

  /** You take a seat. No race yet: start one with your own car (`color`). Race on the grid: your own car, or take over `carId`. Started race: take over `carId` only. */
  join(carId?: string, color = "#ffd166"): boolean {
    if (!this.sim) return this.start(true, color);
    if (this.userRacing) return false;
    const sim = this.sim;
    if (carId) {
      const r = sim.get(carId);
      if (!r || r.out || r.finishedAt !== null) return false;
      sim.setUser(carId, true); this.userId = carId; this.changed();
      return true;
    }
    if (sim.phase !== "countdown") return false;
    const ok = !!sim.add(USER_ID, "You", color, true);
    if (ok) { this.userId = USER_ID; this.changed(); }
    return ok;
  }
  /** Step out of the car: your own car retires, a car you took over goes back to the AI. */
  leave(): void {
    if (!this.userRacing || !this.sim || !this.userId) return;
    if (this.userId === USER_ID) this.sim.retire(USER_ID); else this.sim.setUser(this.userId, false);
    this.userId = null; this.changed();
  }
  stop(): void { if (this.sim) { this.sim = null; this.userId = null; this.changed(); } }

  tick(dt: number): void {
    this.t += dt;
    const sim = this.sim;
    if (!sim) {
      if (!this.auto || !this.track) return;
      this.autoIn -= dt;
      if (this.autoIn <= 0) { this.autoIn = 60 + this.env.rng() * 90; if (this.candidates().length >= MIN_AUTO) this.start(false); }
      return;
    }
    const before = sim.phase;
    for (const r of sim.racers) if (!r.user && !r.id.startsWith("pit") && !r.out && !this.env.alive(r.id)) { sim.retire(r.id); this.changed(); }
    sim.step(dt);
    if (sim.phase !== before) this.changed();
    if (sim.phase === "over") {
      if (this.overFor === 0) this.finish(sim);
      this.overFor += dt;
      if (this.overFor > OVER_SHOW) this.stop();
    }
  }

  private finish(sim: RaceSim): void {
    const st = sim.standings();
    this.last = st.map((r: Racer) => ({ name: r.name, time: r.finishedAt }));
    // only a race that really finished counts (not one you stopped): at least two agents, the first of them across the line
    if (this.env.record && st.some((r) => r.finishedAt !== null)) for (const res of raceResults(st, globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, Date.now())) this.env.record(res);
    this.changed();
  }
}
