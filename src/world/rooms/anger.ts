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
  { id: "pry-bar", name: "Pry bar",     icon: "🪛", power: 1, mult: 1.2, length: 0.8, swingS: 0.55, shaft: "#64748b", head: "#cbd5e1" },
  { id: "crowbar", name: "Wrecking bar", icon: "⛏️", power: 3, mult: 0.8, length: 1.1, swingS: 1.0, shaft: "#ef4444", head: "#b91c1c" },
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
export const COLS = 5, ROWS = 3;
export const MAX_ALIVE = 13; // of COLS*ROWS = 15 slots: always something to hit, never a crowd
export const SESSION_S = 60;
export const WAVE_MIN = 3, WAVE_MAX = 6;
export const WAVE_GAP_MIN_MS = 800, WAVE_GAP_MAX_MS = 1200;

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
  combo: number; comboAt: number; best: number; // hits in a row (each hit within COMBO_MS of the last), the time of the last one, best this visit
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
  return spawn({ weapon, startedAt: now, endsAt: now + SESSION_S * 1000, points: 0, smashed: 0, running: false, nextWaveAt: 0, nextId: 1, targets: [], combo: 0, comboAt: 0, best: 0 }, 8, rnd);
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
/** Wave scheduler: while running and the next wave is due, bring in 3-6 items (never above MAX_ALIVE). Returns the same object when nothing changes. */
export function tickWaves(s: Session, now: number, rnd: Rnd = Math.random): Session {
  if (!s.running || now < s.nextWaveAt) return s;
  const n = WAVE_MIN + Math.floor(rnd() * (WAVE_MAX - WAVE_MIN + 1));
  const gap = WAVE_GAP_MIN_MS + rnd() * (WAVE_GAP_MAX_MS - WAVE_GAP_MIN_MS);
  return { ...spawn(s, n, rnd), nextWaveAt: now + gap };
}

// ---------------------------------------------------------------- combo + the player as the weapon
export const COMBO_MS = 1800;
export const comboOf = (s: Session, now: number): number => (now - s.comboAt <= COMBO_MS ? s.combo : 0);
/** Points multiplier from the combo: x1 below 5 hits, +0.5 per 5 hits, capped at x4. */
export const comboMult = (combo: number): number => Math.min(4, 1 + Math.floor(combo / 5) * 0.5);
export const WEAPON_SCALE = 2.4;     // the weapon is drawn this much bigger than its data length when YOU are the weapon (about 2-3 robot heights)
export const PLAYER_SWING_K = 0.6;   // the player's swing is faster than the little robot's, so clicks can chain
export const REST_PITCH = 0.9;       // resting: the head hangs just above the floor in front of the pointer, ready to wind up
export const weaponReach = (w: Weapon): number => w.length * WEAPON_SCALE;
/** Radius around the pointer in which a swing connects (floor units). Longer weapons sweep wider. */
export const hitRadius = (w: Weapon): number => 0.5 + 0.3 * w.length;
/** How big the mess is: heavier weapons (more damage) throw more and further. */
export const fxScale = (w: Weapon): number => 0.8 + 0.35 * w.power;
/** Pivot of the weapon relative to the hit point so that at impact (pitch 1.2) the head lands on it. */
export function pivotFor(w: Weapon): { dy: number; dz: number } { const L = weaponReach(w); return { dy: L * Math.sin(1.2) + 0.3, dz: -L * Math.cos(1.2) }; }
/** Weapon pitch while the player swings: the swing curve blended with the held-up rest pose (continuous at both ends). */
export function playerPitch(t: number, swingS: number): number {
  if (t < 0 || t >= swingS) return REST_PITCH;
  const k = t / swingS;
  return swingPose(t, swingS).pitch + REST_PITCH * (1 - Math.sin(Math.PI * k));
}
/** Ids of the items a swing landing at (lx, lz) (room-local) connects with: everything within hitRadius, so one blow can hit several. */
export function swingTargets(s: Session, lx: number, lz: number, roomW: number, roomD: number): number[] {
  const w = weaponById(s.weapon);
  if (!w) return [];
  const r = hitRadius(w);
  return s.targets.filter((t) => { const p = slotPos(t.slot, roomW, roomD); return Math.hypot(p.x - lx, p.z - lz) <= r; }).map((t) => t.id);
}
/** Keep the weapon inside the room (it must not roam the campus). */
export function clampToRoom(lx: number, lz: number, roomW: number, roomD: number, margin = 0.4): { x: number; z: number } {
  return { x: Math.min(roomW / 2 - margin, Math.max(-roomW / 2 + margin, lx)), z: Math.min(roomD / 2 - margin, Math.max(-roomD / 2 + margin, lz)) };
}
/** The reception desk footprint in room-local coords: a click there is the menu, not a swing. */
export const overReception = (lx: number, lz: number): boolean => lx > 1.7 && lx < 4.3 && lz > 1.6 && lz < 3.0;

/** Hit several items with one blow. Every target hit adds to the combo; broken ones score points x weapon x combo multiplier. */
export function smashMany(s: Session, ids: number[], now: number): { s: Session; broke: Target[]; hit: Target[] } {
  const w = weapon(s);
  if (!w || isOver(s, now)) return { s, broke: [], hit: [] };
  let cur = s, combo = comboOf(s, now);
  const broke: Target[] = [], hit: Target[] = [];
  for (const id of ids) {
    const t = cur.targets.find((x) => x.id === id);
    if (!t) continue;
    combo++;
    hit.push(t);
    const hp = t.hp - w.power;
    if (hp > 0) { cur = { ...cur, targets: cur.targets.map((x) => (x.id === id ? { ...x, hp, hitAt: now } : x)) }; continue; }
    const pts = Math.round(itemDef(t.kind).pts * w.mult * comboMult(combo));
    cur = { ...cur, targets: cur.targets.filter((x) => x.id !== id), points: cur.points + pts, smashed: cur.smashed + 1 };
    broke.push(t);
  }
  if (!hit.length) return { s, broke, hit };
  return { s: { ...cur, combo, comboAt: now, best: Math.max(cur.best, combo) }, broke, hit };
}
/** Hit one item (the little robot's swing). `broke` is set when this hit destroyed it (points are added). */
export function smash(s: Session, id: number, now: number): { s: Session; broke: Target | null } {
  const r = smashMany(s, [id], now);
  return { s: r.s, broke: r.broke[0] ?? null };
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
export const DEBRIS_CAP = 420;
export type Rnd2 = Rnd;
/** Particle kinds. All share ONE instanced box mesh; the shape multipliers below make slabs of them. */
export const K_CHUNK = 0, K_SPARK = 1, K_DUST = 2, K_CONFETTI = 3, K_GLASS = 4;
export const KIND_SHAPE: [number, number, number][] = [[1, 1, 1], [0.6, 0.6, 2.4], [1, 1, 1], [1.5, 0.12, 1.1], [1.1, 0.25, 0.8]];
/** What each item throws: [glass, confetti, chunks] relative amounts. Monitors shatter, paper and floppies become confetti. */
export const ITEM_FX: Record<ItemKind, { glass: number; confetti: number; chunks: number }> = {
  computer: { glass: 1, confetti: 0, chunks: 1 }, fax: { glass: 0, confetti: 0.6, chunks: 1 }, floppy: { glass: 0, confetti: 1, chunks: 0.5 },
  phone: { glass: 0, confetti: 0, chunks: 1.2 }, mail: { glass: 0, confetti: 1.6, chunks: 0 },
};
/** Struct-of-arrays particle pool. No allocation after construction; spawns recycle the oldest slots when full. */
export class DebrisPool {
  readonly px = new Float32Array(DEBRIS_CAP); readonly py = new Float32Array(DEBRIS_CAP); readonly pz = new Float32Array(DEBRIS_CAP);
  readonly vx = new Float32Array(DEBRIS_CAP); readonly vy = new Float32Array(DEBRIS_CAP); readonly vz = new Float32Array(DEBRIS_CAP);
  readonly size = new Float32Array(DEBRIS_CAP); readonly life = new Float32Array(DEBRIS_CAP); readonly maxLife = new Float32Array(DEBRIS_CAP);
  readonly color: string[] = new Array(DEBRIS_CAP).fill("#ffffff");
  readonly kind = new Uint8Array(DEBRIS_CAP);
  active = 0; private head = 0;
  private add(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: string, kind: number): void {
    const i = this.head; this.head = (this.head + 1) % DEBRIS_CAP;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.color[i] = color; this.kind[i] = kind;
    this.active = DEBRIS_CAP; // recomputed by step
  }
  private scatter(n: number, x: number, y: number, z: number, speed: number, up: number, size: number, life: number, colors: string[], kind: number, rnd: Rnd): void {
    for (let i = 0; i < n; i++) this.add(x, y, z, (rnd() - 0.5) * speed, up * (0.5 + rnd()), (rnd() - 0.5) * speed, size * (0.6 + rnd() * 0.8), life * (0.7 + rnd() * 0.6), colors[i % colors.length]!, kind);
  }
  /** An item broke: chunks (bounce), glass, confetti, sparks and a ring of dust. `power` is fxScale(weapon). */
  spawnBurst(x: number, y: number, z: number, palette: string[], item: ItemKind = "computer", power = 1, rnd: Rnd = Math.random): void {
    const fx = ITEM_FX[item];
    this.scatter(Math.round(10 * power * fx.chunks), x, y, z, 3.4 * power, 2.6, 0.1, 1.5, palette, K_CHUNK, rnd);
    this.scatter(Math.round(12 * power * fx.glass), x, y + 0.2, z, 4 * power, 2.8, 0.07, 1.7, ["#bae6fd", "#e0f2fe", "#7dd3fc"], K_GLASS, rnd);
    this.scatter(Math.round(14 * power * fx.confetti), x, y + 0.2, z, 3.2 * power, 3.4, 0.09, 2.4, palette, K_CONFETTI, rnd);
    this.scatter(Math.round(7 * power), x, y, z, 6 * power, 3, 0.05, 0.4, ["#ffe066", "#fff7ae", "#fb923c"], K_SPARK, rnd);
    const ring = Math.round(8 * power);
    for (let i = 0; i < ring; i++) { const a = (i / ring) * Math.PI * 2 + rnd() * 0.5; this.add(x, 0.1, z, Math.cos(a) * 2.2 * power, 0.2 + rnd() * 0.3, Math.sin(a) * 2.2 * power, 0.28, 0.7, "#9ca3af", K_DUST); }
  }
  /** A hit that did not break the item yet: a few chips and sparks. */
  spawnChips(x: number, y: number, z: number, palette: string[], power = 1, rnd: Rnd = Math.random): void {
    this.scatter(Math.round(4 * power), x, y, z, 2.4, 2, 0.07, 1, palette, K_CHUNK, rnd);
    this.scatter(Math.round(4 * power), x, y, z, 4.5, 2.4, 0.04, 0.3, ["#ffe066", "#fff7ae"], K_SPARK, rnd);
  }
  /** Advance by dt; returns how many particles are alive. Nothing is touched when nothing is alive. */
  step(dt: number): number {
    if (this.active === 0) return 0;
    let alive = 0;
    for (let i = 0; i < DEBRIS_CAP; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) { this.life[i] = 0; continue; }
      alive++;
      const k = this.kind[i]!;
      if (k === K_DUST) this.vy[i]! *= 0.95;
      else if (k === K_CONFETTI) { this.vy[i] = Math.max(this.vy[i]! - 3 * dt, -0.9); this.vx[i]! *= 0.985; this.vz[i]! *= 0.985; this.px[i]! += Math.sin(this.life[i]! * 9 + i) * 0.5 * dt; }
      else this.vy[i]! -= 9 * dt;
      this.px[i]! += this.vx[i]! * dt; this.py[i]! += this.vy[i]! * dt; this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! < 0.04 && (k === K_CHUNK || k === K_GLASS)) { this.py[i] = 0.04; this.vy[i] = -this.vy[i]! * (k === K_GLASS ? 0.45 : 0.3); this.vx[i]! *= 0.7; this.vz[i]! *= 0.7; }
      else if (this.py[i]! < 0.02 && k === K_CONFETTI) { this.py[i] = 0.02; this.vx[i] = 0; this.vz[i] = 0; this.vy[i] = 0; }
    }
    this.active = alive;
    return alive;
  }
}
