/** Rewards, prizes and the claw machine's rules (13.7.9 / 13.4.3). Pure: no React, no DOM, no DB; shared by the server (validation) and the client. */

export type Rng = () => number;
export interface ItemDef { id: string; name: string; icon: string; color: string; kind: "prize" | "trophy"; /** drawing weight in the claw machine (0 = never a prize) */ weight: number }

/** Everything an agent or you can own. Trophies come from won matches (`trophy-<game>`); prizes from the claw machine. */
export const ITEMS: ItemDef[] = [
  { id: "plush-bear", name: "Plush bear", icon: "🧸", color: "#c58b5a", kind: "prize", weight: 6 },
  { id: "rubber-duck", name: "Rubber duck", icon: "🦆", color: "#ffd23f", kind: "prize", weight: 6 },
  { id: "tiny-cactus", name: "Tiny cactus", icon: "🌵", color: "#4caf50", kind: "prize", weight: 5 },
  { id: "toy-rocket", name: "Toy rocket", icon: "🚀", color: "#e55353", kind: "prize", weight: 4 },
  { id: "pixel-heart", name: "Pixel heart", icon: "💖", color: "#ff5c8a", kind: "prize", weight: 4 },
  { id: "snow-globe", name: "Snow globe", icon: "🔮", color: "#7aa8ff", kind: "prize", weight: 3 },
  { id: "golden-gear", name: "Golden gear", icon: "⚙️", color: "#ffb300", kind: "prize", weight: 1 },
  { id: "trophy", name: "Trophy", icon: "🏆", color: "#ffd700", kind: "trophy", weight: 0 },
];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const TROPHY_PREFIX = "trophy-";
export const trophyFor = (game: string): string => `${TROPHY_PREFIX}${game}`;
/** Known item, or a generic trophy for `trophy-<game>`; null = not an item. */
export function itemDef(id: string): ItemDef | null {
  const d = BY_ID.get(id);
  if (d) return d;
  return id.startsWith(TROPHY_PREFIX) && /^trophy-[a-z0-9-]{1,24}$/.test(id) ? { ...BY_ID.get("trophy")!, id, name: `Trophy (${id.slice(TROPHY_PREFIX.length)})` } : null;
}

/** One owned item. `owner` is an agent id, or USER for your own inventory (claw prizes you have not given away yet). */
export const USER = "user";
export interface Reward { id: string; owner: string; item: string; at: number; from: string; note: string }

export const SHELF_SLOTS = 3;
/** The newest items stand on the shelf, the rest is the "archive" list. Stable for equal times (by id). */
export function shelfSplit(rewards: Reward[], slots = SHELF_SLOTS): { shelf: Reward[]; archive: Reward[] } {
  const sorted = [...rewards].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  return { shelf: sorted.slice(0, slots), archive: sorted.slice(slots) };
}

/** Groups rewards by owner. */
export function byOwner(rewards: Reward[]): Map<string, Reward[]> {
  const m = new Map<string, Reward[]>();
  for (const r of rewards) (m.get(r.owner) ?? m.set(r.owner, []).get(r.owner)!).push(r);
  return m;
}

/** Pure inventory ops (the server applies the same rules in SQL; tests cover both). */
export function addReward(list: Reward[], r: Reward): Reward[] {
  return list.some((x) => x.id === r.id) ? list : [...list, r]; // same id twice (double post) is harmless
}
/** Give one item to another owner. Returns the new list, or null when the item is not owned by `from` / target equals the owner. */
export function giveReward(list: Reward[], id: string, from: string, to: string): Reward[] | null {
  const r = list.find((x) => x.id === id);
  if (!r || r.owner !== from || !to || to === from) return null;
  return list.map((x) => (x === r ? { ...x, owner: to, from, at: Date.now() } : x));
}

/** Weighted pick among the prizes (weight 0 never wins). */
export function pickPrize(rnd: number, items: ItemDef[] = ITEMS): ItemDef {
  const pool = items.filter((i) => i.weight > 0), total = pool.reduce((n, i) => n + i.weight, 0);
  let x = rnd * total;
  for (const i of pool) { x -= i.weight; if (x < 0) return i; }
  return pool[pool.length - 1]!;
}

// ---------------------------------------------------------------- claw machine
export const CLAW = { W: 1, H: 1, speed: 0.55, reach: 0.18, drop: 0.5 } as const;
export interface Plush { item: string; x: number; z: number }
export type ClawPhase = "x" | "z" | "drop" | "carry" | "done";

/** The claw closes on a prize when it lands within `reach` of it (no dice: if you are over the icon, you get it). */
export function grabChance(d: number, reach: number = CLAW.reach): number {
  return d >= 0 && d < reach ? 1 : 0;
}

/** Bouncing position 0..1 for a time `t` (triangle wave), so "wait for the right moment" is a pure function of time. */
export const sweep = (t: number, speed: number = CLAW.speed): number => { const p = (t * speed) % 2; return p <= 1 ? p : 2 - p; };

/**
 * One claw round. `press()` = the action button: 1st press stops the claw on the x axis, 2nd on the z axis and it drops, then it
 * grabs (odds from the distance to the nearest prize) and on the way back may drop it again (`carryDrop`). Deterministic with the rng.
 */
export class ClawSim {
  phase: ClawPhase = "x";
  x = 0; z = 0;       // claw position 0..1
  t = 0;
  won: string | null = null;
  grabbed: Plush | null = null;
  log = "";
  private clock = 0;
  readonly plushes: Plush[];
  constructor(private rng: Rng, plushes?: Plush[]) {
    this.plushes = plushes ?? ClawSim.layout(rng);
  }
  /** A spread of 8 prizes over the box, kept apart. */
  static layout(rng: Rng, n = 8): Plush[] {
    const out: Plush[] = [];
    for (let tries = 0; out.length < n && tries < 200; tries++) {
      const p = { item: pickPrize(rng()).id, x: 0.1 + rng() * 0.8, z: 0.1 + rng() * 0.8 };
      if (out.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 0.2)) out.push(p);
    }
    return out;
  }
  step(dt: number): void {
    this.t += dt;
    if (this.phase === "x") this.x = sweep(this.t);
    else if (this.phase === "z") this.z = sweep(this.t - this.clock);
    else if (this.phase === "drop" || this.phase === "carry") {
      this.clock -= dt;
      if (this.clock <= 0) this.phase === "drop" ? this.grab() : this.finishCarry();
    }
  }
  press(): void {
    if (this.phase === "x") { this.phase = "z"; this.clock = this.t; }
    else if (this.phase === "z") { this.phase = "drop"; this.clock = CLAW.drop; }
  }
  /** Nearest prize and its distance, or null when the box is empty. */
  nearest(): { p: Plush; d: number } | null {
    let best: { p: Plush; d: number } | null = null;
    for (const p of this.plushes) { const d = Math.hypot(p.x - this.x, p.z - this.z); if (!best || d < best.d) best = { p, d }; }
    return best;
  }
  private grab(): void {
    const n = this.nearest();
    if (n && grabChance(n.d) > 0) { this.grabbed = n.p; this.phase = "carry"; this.clock = CLAW.drop; this.log = "Got one!"; }
    else { this.phase = "done"; this.log = "Missed."; }
  }
  private finishCarry(): void {
    this.phase = "done";
    this.won = this.grabbed?.item ?? null; this.log = "It dropped into the chute!";
  }
}
