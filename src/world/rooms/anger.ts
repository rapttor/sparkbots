/** Anger room logic (pure, no rendering): weapons, smashable items, wrecking waves, points, debris and swing math. */

// ---------------------------------------------------------------- weapons
export interface Weapon {
  id: string; name: string; icon: string;
  power: number;     // damage per hit
  mult: number;      // points multiplier
  length: number;    // weapon length in world units (renderer)
  swingS: number;    // seconds for one full swing (wind-up + hit + recover)
  shaft: string; head: string; // colours
}
export const WEAPONS: Weapon[] = [
  { id: "bat",     name: "Bat",         icon: "🏏", power: 1, mult: 1,   length: 0.9, swingS: 0.7, shaft: "#d6a560", head: "#b7813d" },
  { id: "hammer",  name: "Hammer",      icon: "🔨", power: 2, mult: 1,   length: 0.7, swingS: 0.9, shaft: "#8b5e3c", head: "#6b7280" },
  { id: "wrench",  name: "Box wrench",  icon: "🔧", power: 1, mult: 1.5, length: 0.6, swingS: 0.6, shaft: "#9ca3af", head: "#e5e7eb" },
  { id: "pry-bar", name: "Pry bar",     icon: "🪛", power: 1, mult: 1.2, length: 0.8, swingS: 0.55, shaft: "#475569", head: "#94a3b8" },
  { id: "crowbar", name: "Wrecking bar", icon: "⛏️", power: 3, mult: 0.8, length: 1.1, swingS: 1.0, shaft: "#b91c1c", head: "#7f1d1d" },
];
export const weaponById = (id: string | null): Weapon | undefined => WEAPONS.find((w) => w.id === id);

// ---------------------------------------------------------------- items
export type ItemKind = "computer" | "fax" | "floppy" | "phone" | "mail";
export interface ItemDef { kind: ItemKind; name: string; hp: number; pts: number; palette: string[] }
export const ITEMS: ItemDef[] = [
  { kind: "computer", name: "Computer",    hp: 3, pts: 20, palette: ["#d6d3c4", "#2b2f36", "#7dd3fc", "#9ca3af"] },
  { kind: "fax",      name: "Fax machine", hp: 2, pts: 15, palette: ["#e5e7eb", "#6b7280", "#f5f5f4", "#1f2937"] },
  { kind: "floppy",   name: "Floppy disk", hp: 1, pts: 5,  palette: ["#1f2937", "#9ca3af", "#f5f5f4", "#ef4444"] },
  { kind: "phone",    name: "Phone",       hp: 1, pts: 8,  palette: ["#b91c1c", "#1f2937", "#e5e7eb", "#fbbf24"] },
  { kind: "mail",     name: "Mail",        hp: 1, pts: 5,  palette: ["#f5f5f4", "#e7d9b0", "#ef4444", "#93c5fd"] },
];
export const itemDef = (k: ItemKind): ItemDef => ITEMS.find((i) => i.kind === k)!;

// ---------------------------------------------------------------- floor slots
export const COLS = 4, ROWS = 3;
export const MAX_ALIVE = 9;
export const SESSION_S = 60;
export const WAVE_MIN = 2, WAVE_MAX = 4;
export const WAVE_GAP_MIN_MS = 3000, WAVE_GAP_MAX_MS = 4000;

/** Position of slot i inside a (w x d) room, relative to its centre. */
export function slotPos(i: number, w: number, d: number): { x: number; z: number } {
  const c = i % COLS, r = Math.floor(i / COLS);
  return { x: ((c + 0.5) / COLS - 0.5) * (w - 3), z: ((r + 0.5) / ROWS - 0.5) * (d - 3.2) - 0.4 };
}

export interface Target { id: number; kind: ItemKind; slot: number; hp: number; maxHp: number; hitAt: number }
export interface Session {
  weapon: string | null; startedAt: number; endsAt: number; points: number; smashed: number;
  running: boolean;        // a wrecking run: waves keep coming until stopped
  nextWaveAt: number; nextId: number; targets: Target[];
}
type Rnd = () => number;
const pick = <T,>(a: T[], rnd: Rnd): T => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))]!;

export function spawn(s: Session, n: number, rnd: Rnd = Math.random): Session {
  const free = Array.from({ length: COLS * ROWS }, (_, i) => i).filter((i) => !s.targets.some((t) => t.slot === i));
  const k = Math.max(0, Math.min(n, free.length, MAX_ALIVE - s.targets.length));
  const targets = [...s.targets];
  let nextId = s.nextId;
  for (let j = 0; j < k; j++) {
    const slot = free.splice(Math.floor(rnd() * free.length), 1)[0]!;
    const def = pick(ITEMS, rnd);
    targets.push({ id: nextId++, kind: def.kind, slot, hp: def.hp, maxHp: def.hp, hitAt: 0 });
  }
  return { ...s, targets, nextId };
}
/** A fresh visit: pick weapon, 60 s on the clock, an initial set of items, no wrecking run yet. */
export function startSession(weapon: string | null, now: number, rnd: Rnd = Math.random): Session {
  return spawn({ weapon, startedAt: now, endsAt: now + SESSION_S * 1000, points: 0, smashed: 0, running: false, nextWaveAt: 0, nextId: 1, targets: [] }, 8, rnd);
}
export const timeLeft = (s: Session, now: number): number => (s.running ? Infinity : Math.max(0, (s.endsAt - now) / 1000));
/** Over = not running and the clock ran out (or nothing left and no run to refill it). */
export const isOver = (s: Session, now: number): boolean => !s.running && (now >= s.endsAt || s.targets.length === 0);

/** Reception click: start the wrecking run (waves, no clock) or stop it (leftovers stay for a fresh 60 s). */
export function startRun(s: Session, now: number, rnd: Rnd = Math.random): Session {
  if (s.running) return s;
  return spawn({ ...s, running: true, nextWaveAt: now + WAVE_GAP_MIN_MS }, WAVE_MAX, rnd);
}
export function stopRun(s: Session, now: number): Session {
  return s.running ? { ...s, running: false, endsAt: now + SESSION_S * 1000 } : s;
}
/** Wave scheduler: while running and the next wave is due, bring in 2-4 items (never above MAX_ALIVE). Returns the same object when nothing changes. */
export function tickWaves(s: Session, now: number, rnd: Rnd = Math.random): Session {
  if (!s.running || now < s.nextWaveAt) return s;
  const n = WAVE_MIN + Math.floor(rnd() * (WAVE_MAX - WAVE_MIN + 1));
  const gap = WAVE_GAP_MIN_MS + rnd() * (WAVE_GAP_MAX_MS - WAVE_GAP_MIN_MS);
  return { ...spawn(s, n, rnd), nextWaveAt: now + gap };
}

/** Hit an item. Needs a weapon and a live session. `broke` is set when this hit destroyed it (points are added). */
export function smash(s: Session, id: number, now: number): { s: Session; broke: Target | null } {
  const w = weapon(s);
  const t = s.targets.find((x) => x.id === id);
  if (!w || !t || isOver(s, now)) return { s, broke: null };
  const hp = t.hp - w.power;
  if (hp > 0) return { s: { ...s, targets: s.targets.map((x) => (x.id === id ? { ...x, hp, hitAt: now } : x)) }, broke: null };
  const pts = Math.round(itemDef(t.kind).pts * w.mult);
  return { s: { ...s, targets: s.targets.filter((x) => x.id !== id), points: s.points + pts, smashed: s.smashed + 1 }, broke: t };
}
const weapon = (s: Session) => weaponById(s.weapon);

// ---------------------------------------------------------------- swing animation (pure)
/** Weapon pitch (radians, 0 = held up, positive = swung forward/down) over a swing of `swingS` seconds, and the impact moment. */
export const HIT_AT = 0.45; // fraction of the swing at which the weapon lands
export function swingPose(t: number, swingS: number): { pitch: number; hit: boolean; done: boolean } {
  const k = Math.max(0, t / swingS);
  if (k >= 1) return { pitch: 0, hit: false, done: true };
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (k < HIT_AT * 0.6) return { pitch: -1.1 * ease(k / (HIT_AT * 0.6)), hit: false, done: false };                  // wind-up (raise back)
  if (k < HIT_AT) return { pitch: -1.1 + 2.3 * ease((k - HIT_AT * 0.6) / (HIT_AT * 0.4)), hit: false, done: false };    // strike
  return { pitch: 1.2 * (1 - ease((k - HIT_AT) / (1 - HIT_AT))), hit: k - HIT_AT < 0.05, done: false };               // recover
}
/** Wobble of a hit item: decaying shake for ~0.4 s after `hitAt`. */
export const hitShake = (now: number, hitAt: number): number => { const a = (now - hitAt) / 1000; return hitAt > 0 && a >= 0 && a < 0.4 ? Math.sin(a * 60) * 0.12 * (1 - a / 0.4) : 0; };
/** How flattened a damaged item looks (1 = intact, down to 0.7). */
export const flatten = (t: Target): number => 1 - 0.3 * (1 - t.hp / t.maxHp);

// ---------------------------------------------------------------- debris (pure, preallocated pool)
export const DEBRIS_CAP = 160;
export interface Burst { n: number }
/** Struct-of-arrays particle pool. No allocation after construction; `spawnBurst` recycles the oldest slots when full. */
export class DebrisPool {
  readonly px = new Float32Array(DEBRIS_CAP); readonly py = new Float32Array(DEBRIS_CAP); readonly pz = new Float32Array(DEBRIS_CAP);
  readonly vx = new Float32Array(DEBRIS_CAP); readonly vy = new Float32Array(DEBRIS_CAP); readonly vz = new Float32Array(DEBRIS_CAP);
  readonly size = new Float32Array(DEBRIS_CAP); readonly life = new Float32Array(DEBRIS_CAP); readonly maxLife = new Float32Array(DEBRIS_CAP);
  readonly color: string[] = new Array(DEBRIS_CAP).fill("#ffffff");
  readonly kind = new Uint8Array(DEBRIS_CAP); // 0 chunk, 1 spark, 2 dust
  active = 0; private head = 0;
  private add(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: string, kind: number): void {
    const i = this.head; this.head = (this.head + 1) % DEBRIS_CAP;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.color[i] = color; this.kind[i] = kind;
  }
  /** Chunks in the item's colours, a few sparks and a dust puff. */
  spawnBurst(x: number, y: number, z: number, palette: string[], rnd: Rnd = Math.random): void {
    for (let i = 0; i < 10; i++) this.add(x, y, z, (rnd() - 0.5) * 3.2, 1.5 + rnd() * 2.6, (rnd() - 0.5) * 3.2, 0.07 + rnd() * 0.1, 1.2 + rnd() * 0.6, palette[i % palette.length]!, 0);
    for (let i = 0; i < 5; i++) this.add(x, y, z, (rnd() - 0.5) * 5, 1 + rnd() * 3, (rnd() - 0.5) * 5, 0.04, 0.3 + rnd() * 0.2, "#ffe066", 1);
    for (let i = 0; i < 3; i++) this.add(x, y - 0.1, z, (rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.4, (rnd() - 0.5) * 0.8, 0.25, 0.6, "#9ca3af", 2);
    this.active = DEBRIS_CAP; // recomputed by step
  }
  /** Advance by dt; returns how many particles are alive. Nothing to do (and nothing touched) when nothing was spawned. */
  step(dt: number): number {
    if (this.active === 0) return 0;
    let alive = 0;
    for (let i = 0; i < DEBRIS_CAP; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt; // typed arrays: compound assignment is fine
      if (this.life[i]! <= 0) { this.life[i] = 0; continue; }
      alive++;
      const k = this.kind[i]!;
      if (k !== 2) this.vy[i]! -= 9 * dt; else this.vy[i]! *= 0.96;
      this.px[i]! += this.vx[i]! * dt; this.py[i]! += this.vy[i]! * dt; this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! < 0.04 && k === 0) { this.py[i] = 0.04; this.vy[i] = -this.vy[i]! * 0.3; this.vx[i]! *= 0.7; this.vz[i]! *= 0.7; }
    }
    this.active = alive;
    return alive;
  }
}
