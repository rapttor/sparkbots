import { GAMES, GAME_IDS, pickGame } from "./registry";
import { RallySim } from "./rally";
import { playSpot, seatSpots, type PlacedSlot, type Spot } from "./tables";
import type { GameId, GameResult, GameSim, Rng } from "./types";

/** Everything the hub needs from the outside world (the roaming bots); faked in tests. */
export interface HubEnv {
  rng: Rng;
  /** Agents that may be recruited right now: idle, wandering, on no trip, not held by a menu. */
  idle(): string[];
  /** Sleeping agents that may be woken for a game you start yourself (never for automatic ones). */
  sleeping?(): string[];
  /** One agent: may it be recruited? */
  free(agent: string): boolean;
  /** Is the agent still on its way to / at this table (false once real work pulled it back or it disappeared)? */
  alive(agent: string, instance: string): boolean;
  /** Walk there (spot) or leave the game (null). */
  send(agent: string, spot: Spot | null, instance: string): void;
  arrived(agent: string): boolean;
  name(agent: string): string;
  record(r: GameResult): void;
}

/** Guest bots are not sessions: they sit in the second seat when only one agent is free. */
export const GUEST_PREFIX = "guest:";
export const isGuest = (a: string | null | undefined): boolean => !!a && a.startsWith(GUEST_PREFIX);

export type Phase = "gathering" | "playing" | "over";
export interface Seat { agent: string | null; arrived: boolean }
export interface Instance {
  id: string;
  game: GameId;
  slot: PlacedSlot;
  seats: [Seat, Seat];
  phase: Phase;
  sim: GameSim | null;
  line: string;          // what is shown above the table
  detail: string;        // second line (what was thrown)
  since: number;         // hub time of the last phase change
  winner: 0 | 1 | null;
  manual: boolean;       // started from the UI: not removed because nobody joined
  rematches: number;
}

export const GATHER_TIMEOUT = 150;  // s to reach the table (the campus is big)
export const WAIT_TIMEOUT = 90;     // s a lone player waits for an opponent
export const OVER_SHOW = 6;         // s the result stays above the table
export const MAX_AUTO = 2;          // tables idle agents start on their own at once
export const REMATCH_CHANCE = 0.35;
export const MAX_REMATCHES = 3;

/**
 * Owns the table instances of the game room: creates a table when asked (or when idle agents pair up), reserves seats, runs the
 * match, writes the result, removes the table again when nobody continues. Pure: it talks to the world only through `HubEnv`.
 */
export class GameHub {
  instances: Instance[] = [];
  slots: PlacedSlot[] = [];
  /** Idle agents start games by themselves. */
  auto = true;
  private t = 0;
  private n = 0;
  private pairIn = 4;
  private listeners = new Set<() => void>();
  constructor(private env: HubEnv) {}

  setEnv(env: HubEnv): void { this.env = env; }
  /** Subscribe to structural changes (a table appeared / vanished, a score changed, a phase changed). */
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** Bumped on every structural change; a cheap snapshot for React's useSyncExternalStore. */
  version = 0;
  /** Idle agents that could join a game right now (for the "start a game" form). */
  candidates(): string[] { return this.env.idle().filter((a) => !this.inGame(a)); }
  /**
   * The two start buttons. "vs" calls ONE agent (idle first, else a sleeper, which is woken); "auto" calls TWO. Everyone busy working = nothing
   * starts. With only one agent for a two-seat table a guest bot (not a session, drawn by the game layer) plays the other seat.
   */
  quick(game: GameId, mode: "vs" | "auto"): { inst: Instance | null; msg: string } {
    const shuffle = (xs: string[]) => xs.map((x) => [this.env.rng(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    const idle = shuffle(this.candidates()), asleep = shuffle((this.env.sleeping?.() ?? []).filter((a) => !this.inGame(a)));
    const agents = [...idle, ...asleep].slice(0, mode === "auto" ? 2 : 1);
    if (!agents.length) return { inst: null, msg: "No agent is available: everyone is busy working." };
    const guest = agents.length < 2;
    const inst = this.open(game, guest ? [agents[0]!, this.newGuest()] : agents, true);
    if (!inst) return { inst: null, msg: "No free table for that game right now." };
    return { inst, msg: guest ? `A guest bot joined to play against ${this.env.name(agents[0]!)}.` : "" };
  }
  private guests = 0;
  newGuest(): string { return `${GUEST_PREFIX}${++this.guests}`; }
  nameOf(agent: string): string { return this.env.name(agent); }
  private changed(): void { this.version++; for (const l of this.listeners) l(); }

  setSlots(slots: PlacedSlot[]): void {
    this.slots = slots;
    if (this.instances.some((i) => !slots.some((s) => s.id === i.slot.id))) this.stopAll(); // the layout changed under us
  }

  inGame(agent: string): Instance | undefined { return this.instances.find((i) => i.seats.some((s) => s.agent === agent)); }

  /** A free table spot for the game: its own built-in table first, then the first free matching spot. */
  freeSlot(game: GameId): PlacedSlot | null {
    const size = GAMES[game].size, used = new Set(this.instances.map((i) => i.slot.id));
    const ok = this.slots.filter((s) => !used.has(s.id) && s.size === size && (!s.builtFor || s.builtFor === game));
    return ok.find((s) => s.builtFor === game) ?? ok[0] ?? null;
  }
  canOpen(game: GameId): boolean { return this.freeSlot(game) !== null; }

  /** Start a table for 1 or 2 agents (a lone agent waits for an invited opponent). Null when no table is free or an agent is busy. */
  open(game: GameId, agents: string[], manual = false): Instance | null {
    const ids = [...new Set(agents)].slice(0, 2);
    if (!ids.length || ids.some((a) => this.inGame(a) || !this.env.free(a))) return null;
    const slot = this.freeSlot(game);
    if (!slot) return null;
    const inst: Instance = { id: `g${++this.n}`, game, slot, seats: [{ agent: null, arrived: false }, { agent: null, arrived: false }], phase: "gathering", sim: null, line: "", detail: "", since: this.t, winner: null, manual, rematches: 0 };
    this.instances.push(inst);
    ids.forEach((a, i) => this.seat(inst, i as 0 | 1, a));
    this.changed();
    return inst;
  }

  /** Bring one more agent to a table that is waiting for an opponent. */
  invite(instanceId: string, agent: string): boolean {
    const inst = this.instances.find((i) => i.id === instanceId);
    if (!inst || inst.phase !== "gathering" || this.inGame(agent) || !this.env.free(agent)) return false;
    const i = inst.seats.findIndex((s) => !s.agent);
    if (i < 0) return false;
    this.seat(inst, i as 0 | 1, agent);
    inst.since = this.t;
    this.changed();
    return true;
  }

  private seat(inst: Instance, i: 0 | 1, agent: string): void {
    inst.seats[i] = { agent, arrived: false };
    this.env.send(agent, seatSpots(GAMES[inst.game].size, inst.slot.x, inst.slot.z)[i], inst.id);
  }

  /** Exit a game at any time (the ✕ in the header): nothing is recorded and the table goes away. */
  stop(instanceId: string): void {
    const inst = this.instances.find((i) => i.id === instanceId);
    if (inst) this.close(inst);
  }
  stopAll(): void { for (const i of [...this.instances]) this.close(i); }

  private close(inst: Instance): void {
    for (const s of inst.seats) if (s.agent) this.env.send(s.agent, null, inst.id);
    this.instances = this.instances.filter((i) => i !== inst);
    this.changed();
  }

  /** Advance time by dt seconds. */
  tick(dt: number): void {
    this.t += dt;
    for (const inst of [...this.instances]) this.advance(inst, dt);
    if (this.auto) {
      this.pairIn -= dt;
      if (this.pairIn <= 0) { this.pairIn = 3 + this.env.rng() * 6; this.pair(); }
    }
  }

  private advance(inst: Instance, dt: number): void {
    for (const s of inst.seats) if (s.agent && !this.env.alive(s.agent, inst.id)) { this.close(inst); return; } // work calls: the game is off
    const age = this.t - inst.since;
    if (inst.phase === "gathering") {
      for (const s of inst.seats) if (s.agent) s.arrived = this.env.arrived(s.agent);
      const full = inst.seats.every((s) => s.agent);
      if (full && inst.seats.every((s) => s.arrived)) { this.begin(inst); return; }
      if (age > (full ? GATHER_TIMEOUT : WAIT_TIMEOUT)) this.close(inst);
    } else if (inst.phase === "playing" && inst.sim) {
      const sim: GameSim = inst.sim;
      sim.step(dt);
      if (sim instanceof RallySim) this.follow(inst, sim);
      const line = sim.line(), detail = sim.detail?.() ?? "";
      if (line !== inst.line || detail !== inst.detail) { inst.line = line; inst.detail = detail; this.changed(); }
      if (sim.over) this.finish(inst);
    } else if (inst.phase === "over" && age > OVER_SHOW) {
      if (inst.rematches < MAX_REMATCHES && this.env.rng() < REMATCH_CHANCE) { inst.rematches++; this.begin(inst); }
      else this.close(inst);
    }
  }

  private begin(inst: Instance): void {
    inst.sim = GAMES[inst.game].create(this.env.rng);
    inst.phase = "playing"; inst.since = this.t; inst.winner = null; inst.line = inst.sim.line(); inst.detail = "";
    this.changed();
  }

  /** Agents walk with their paddles. */
  private follow(inst: Instance, sim: RallySim): void {
    inst.seats.forEach((s, i) => { if (s.agent) this.env.send(s.agent, playSpot(inst.game, i as 0 | 1, inst.slot.x, inst.slot.z, sim), inst.id); });
  }

  private finish(inst: Instance): void {
    const sim = inst.sim!, [a, b] = inst.seats.map((s) => s.agent!) as [string, string];
    inst.phase = "over"; inst.since = this.t; inst.winner = sim.winner;
    this.env.record({
      uuid: `${Date.now().toString(36)}-${inst.id}-${Math.floor(this.env.rng() * 1e9).toString(36)}`, at: Date.now(), game: inst.game, a, b,
      aName: this.env.name(a), bName: this.env.name(b), scoreA: sim.score[0], scoreB: sim.score[1],
      winner: sim.winner === null ? null : sim.winner === 0 ? a : b,
    });
    this.changed();
  }

  /** Two idle agents walk to a table and play. */
  private pair(): void {
    if (this.instances.filter((i) => !i.manual).length >= MAX_AUTO) return;
    const idle = this.candidates();
    if (idle.length < 2) return;
    const game = pickGame(this.env.rng(), GAME_IDS.filter((g) => this.canOpen(g)));
    if (!game) return;
    const i = Math.floor(this.env.rng() * idle.length);
    const a = idle[i]!, rest = idle.filter((_, k) => k !== i), b = rest[Math.floor(this.env.rng() * rest.length)]!;
    this.open(game, [a, b]);
  }
}
