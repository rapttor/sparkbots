import type { PlacedPoi } from "./zones";

/** Where a bot currently is. Bots leave their chair when idle (wander), lie down when asleep, and run back to the
 *  desk when they are working or when you open their chat. */
export type BotMode = "desk" | "wander" | "sleep" | "rush" | "circle" | "follow";
export interface Roam {
  x: number; z: number; tx: number; tz: number; wait: number; ry: number; lying: boolean; moving: boolean;
  mode: BotMode;
  awakeUntil: number; // performance.now() until which a sleeping bot stays up (after being zapped)
  flash: boolean;     // body color is currently tinted by an action and must be restored
  angle: number;      // position on the circle walked by a "circle" robot
  clip: { id: string; t0: number; until: number } | null; // idle clip currently playing
  icon: string;       // emoji floating above the head ("" = none)
  followFace?: number; // where a follower should face once it has arrived
  errand: { x: number; z: number; done: () => void; hold?: number; arrivedAt?: number } | null; // a walk with a purpose (e.g. filing itself into the archive); done() runs on arrival
  visit: { poi: PlacedPoi; slot: number; arrived: boolean; until: number } | null; // idle trip to a zone (see pickVisit)
  squash?: number;   // performance.now() until which the agent is flattened (run over in the race track's carmageddon mode; purely visual)
  flee?: { until: number; x: number; z: number } | null; // after a squash: running away, screaming
  game?: GameIntent | null; // idle agent on its way to / playing at a game table (src/world/games); dropped as soon as real work calls
}
/** Where an agent should stand for a game and which way to face. Owned by the games hub, which keeps x/z up to date. */
export interface GameIntent { instance: string; x: number; z: number; face: number; arrived: boolean }
export const roams = new Map<string, Roam>();

/** Agents with an open action menu: they stand still until it closes, so the thing you clicked does not wander away. */
const held = new Set<string>();
export const holdAgent = (id: string): void => { held.add(id); };
export const releaseAgent = (id: string): void => { held.delete(id); };
export const isHeld = (id: string): boolean => held.has(id);

/** A purely visual override ("show as ..."): the robot acts out a status for a while. The real status never changes. */
export interface Look { state: "asleep" | "idle" | "working" | "waiting" | "done" | "error"; sit?: boolean; until: number }
export const looks = new Map<string, Look>();
export const LOOK_MS = 30_000;
export function setLook(id: string, state: Look["state"], sit = false, ms = LOOK_MS): void { looks.set(id, { state, sit, until: performance.now() + ms }); }
export function clearLook(id: string): void { looks.delete(id); }
/** The status a robot should act out right now: the look override if one is active, else the real status. */
export function effectiveState<S extends string>(id: string, real: S): S | Look["state"] {
  const l = looks.get(id);
  if (!l) return real;
  if (l.until <= performance.now()) { looks.delete(id); return real; }
  return l.state;
}
/** Where "you" are right now in any mode: your avatar when walking, the hand when in hand mode, the camera focus otherwise. Drones and service robots bring things here. */
export const managerAt = { x: 0, z: 0 };
/** The manager's position in walk mode (null in overview): bots step out of the way. */
export const player: { x: number; z: number; on: boolean; hx: number; hz: number; still: number; fast: boolean } = { x: 0, z: 0, on: false, hx: 0, hz: -1, still: 0, fast: false };

const SEP = 0.8;        // bots keep at least this far apart
const PLAYER_SEP = 0.95;

// ---- neighbour lookup -------------------------------------------------------------------------------------------------
// With hundreds of bots, checking every other bot for every step is O(n²) and stalls the frame. They all live in a uniform
// grid that is rebuilt once per simulated frame; queries only touch the cells around the point.
const CELL = 2; // one cell covers SEP / PLAYER_SEP / LOOK_AHEAD inside a 3x3 query
const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
const grid = new Map<number, Roam[]>();
let gridReady = false;

/** Rebuild the position grid. Call once before stepping the bots in a frame. */
export function rebuildRoamGrid(): void {
  grid.clear();
  for (const o of roams.values()) {
    const k = cellKey(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
    const cell = grid.get(k);
    if (cell) cell.push(o); else grid.set(k, [o]);
  }
  gridReady = true;
}

/** Visit the bots near (x, z) within radius. Falls back to every bot before the first grid build. */
function forEachNear(x: number, z: number, radius: number, cb: (o: Roam) => void): void {
  if (!gridReady) { for (const o of roams.values()) cb(o); return; }
  const span = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
    const cell = grid.get(cellKey(cx + dx, cz + dz));
    if (cell) for (const o of cell) cb(o);
  }
}

/**
 * Keeps bots from walking through each other (and through the manager). Wanderers always step aside; a bot that is
 * on its way somewhere steps aside for anyone who is not a wanderer; bots sitting at their desks or lying in bed never move.
 */
export function separate(id: string, r: Roam): void {
  const yields = r.mode === "wander" || r.moving;
  if (!yields) return;
  const push = (ox: number, oz: number, min: number, share: number) => {
    let dx = r.x - ox, dz = r.z - oz;
    if (Math.abs(dx) > min || Math.abs(dz) > min) return;
    const d = Math.hypot(dx, dz);
    if (d >= min) return;
    if (d < 1e-3) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
    const k = ((min - d) * share) / Math.max(d, 1e-3);
    r.x += dx * k; r.z += dz * k;
  };
  const self = roams.get(id);
  forEachNear(r.x, r.z, SEP, (o) => {
    if (o === self) return;
    if (r.mode !== "wander" && o.mode === "wander") return; // the wanderer yields to us
    push(o.x, o.z, SEP, o.moving && (o.mode === "wander" || r.mode === "wander") ? 0.5 : 1);
  });
  if (player.on) push(player.x, player.z, PLAYER_SEP, 1);
}

/** Pushes the manager out of any bot it overlaps. Robots seated at their desk or lying in bed do not push: desks and
 *  laptops are walk-through, so you can cross a desk even if its robot sits right there (the robot stays put). */
export function pushPlayerOut(p: { x: number; z: number }): void {
  forEachNear(p.x, p.z, 0.7, (o) => {
    if (!o.moving && (o.mode === "desk" || o.mode === "sleep")) return;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < 0.7 && d > 1e-3) { const k = (0.7 - d) / d; p.x += dx * k; p.z += dz * k; }
  });
}


/** Spots idle robots may walk to, and who stands where. Reset whenever the layout changes. */
let pois: PlacedPoi[] = [];
const taken = new Map<string, (string | null)[]>();
let allPois: PlacedPoi[] = [];
export function setPois(list: PlacedPoi[]): void { allPois = list; pois = list.filter((p) => p.idle); taken.clear(); }
/** Send a robot to a named spot (any POI, idle or not); `done` runs when it gets there. False if the spot does not exist. */
export function startErrand(worker: string, poiId: string, done: () => void, holdMs = 0): boolean {
  const p = allPois.find((q) => q.id === poiId), r = roams.get(worker);
  if (!p || !r) return false;
  r.errand = { x: p.x, z: p.z, done, hold: holdMs || undefined };
  return true;
}
/** One entry per zone that has spots: where "Send to..." can take a robot. */
export function poiChoices(): { id: string; label: string }[] {
  const seen = new Set<string>(), out: { id: string; label: string }[] = [];
  for (const p of allPois) if (!seen.has(p.zone)) { seen.add(p.zone); out.push({ id: p.id, label: p.label }); }
  return out;
}
export const poiCount = () => pois.length;
/** One spot by its id ("water-cooler:chat"), or undefined when that room is not in the layout. */
export const poiById = (id: string): PlacedPoi | undefined => allPois.find((p) => p.id === id);

/** Where robot number `slot` stands at a POI: the first one on the spot, the others in a ring around it. */
export function slotPos(p: PlacedPoi, slot: number): { x: number; z: number } {
  if (slot === 0) return { x: p.x, z: p.z };
  const a = (slot / p.slots) * Math.PI * 2 + p.face;
  return { x: p.x + Math.sin(a) * 0.75, z: p.z + Math.cos(a) * 0.75 };
}

/** Picks a random free POI (popular zones more often) and reserves a slot for the robot; null when everything is full. */
export function pickVisit(worker: string, rnd = Math.random()): { poi: PlacedPoi; slot: number } | null {
  const free = pois.filter((p) => (taken.get(p.id) ?? []).filter(Boolean).length < p.slots);
  const total = free.reduce((n, p) => n + p.weight, 0);
  if (!free.length || total <= 0) return null;
  let x = rnd * total, poi = free[free.length - 1]!;
  for (const p of free) { x -= p.weight; if (x <= 0) { poi = p; break; } }
  const arr = taken.get(poi.id) ?? [];
  let slot = arr.findIndex((w) => !w);
  if (slot < 0) slot = arr.length;
  arr[slot] = worker; taken.set(poi.id, arr);
  return { poi, slot };
}
export function releaseVisit(worker: string, poi: PlacedPoi, slot: number): void {
  const arr = taken.get(poi.id);
  if (arr && arr[slot] === worker) arr[slot] = null;
}
export const poiExists = (id: string) => pois.some((p) => p.id === id);

/** Agents that have working sub-agents right now: they conduct. Filled by the minibots layer. */
export const conductors = new Set<string>();


// ---- followers: agents that walk with the manager (shift+click, F, or the agent menu) ----------------------------------
let followers: string[] = [];
export const setFollowers = (ids: string[]) => { followers = ids; };
export const followerList = () => followers;
export const followerIndex = (id: string) => followers.indexOf(id);

export interface Room { x: number; z: number; w: number; d: number }
/** The conference room, when the layout has one; `count` = followers currently seated (drives the table size). */
export const meeting: { room: Room | null; count: number } = { room: null, count: 0 };
export const MAX_SEATS = 10;
export const insideRoom = (r: Room, x: number, z: number) => Math.abs(x - r.x) < r.w / 2 - 0.2 && Math.abs(z - r.z) < r.d / 2 - 0.2;

/** Seat i of n around the table: two rows facing each other, 1.5 apart. */
export function seatPos(room: Room, i: number, n: number): { x: number; z: number; face: number } {
  const perSide = Math.ceil(n / 2), side = i % 2, idx = Math.floor(i / 2);
  return { x: room.x + (idx - (perSide - 1) / 2) * 1.5, z: room.z + (side === 0 ? -1.2 : 1.2), face: side === 0 ? Math.PI : 0 };
}

/**
 * Where follower i of n should be right now: in a seat when the manager is in the conference room, in a circle around the
 * manager (a huddle, e.g. at the water cooler) when the manager stands still, otherwise in a loose line behind.
 */
export function followTarget(i: number, n: number): { x: number; z: number; face: number; kind: "seat" | "huddle" | "trail" } {
  const m = meeting.room;
  if (m && i < MAX_SEATS && insideRoom(m, player.x, player.z)) return { ...seatPos(m, i, Math.min(n, MAX_SEATS)), kind: "seat" };
  if (player.still > 1.2) {
    const a = (i / Math.max(1, n)) * Math.PI * 2, x = player.x + Math.sin(a) * 1.6, z = player.z + Math.cos(a) * 1.6;
    return { x, z, face: Math.atan2(-(player.x - x), -(player.z - z)), kind: "huddle" };
  }
  const len = Math.hypot(player.hx, player.hz) || 1, hx = player.hx / len, hz = player.hz / len;
  const row = Math.floor(i / 3) + 1, lat = (i % 3) - 1;
  return { x: player.x - hx * 1.3 * row + -hz * lat, z: player.z - hz * 1.3 * row + hx * lat, face: Math.atan2(-hx, -hz), kind: "trail" };
}

/** Wake every sleeping robot in `ids` for a while (visual only). */
export function wakeAll(ids: string[], ms = 15_000): number {
  let n = 0;
  for (const id of ids) { const r = roams.get(id); if (r) { r.awakeUntil = performance.now() + ms; n++; } }
  return n;
}

/** Send idle robots on a trip to a zone right now (the "lunch break"). Returns how many set off. */
export function lunchAll(ids: string[]): number {
  let n = 0;
  for (const id of ids) {
    const r = roams.get(id);
    if (!r || r.visit || r.mode !== "wander") continue;
    const v = pickVisit(id);
    if (!v) break; // everything is full
    r.visit = { poi: v.poi, slot: v.slot, arrived: false, until: 0 };
    n++;
  }
  return n;
}

// ---- going around people --------------------------------------------------------------------------------------------
const LOOK_AHEAD = 1.5;

const isOdd = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return (h & 1) === 1; };

/**
 * Is the manager, or another robot that is not just wandering, standing within `radius` of the point? A robot that wants to
 * sit at its desk waits a step away while that is true (instead of pushing against whoever is in the way) and takes the
 * seat when it is free again.
 */
export function occupiedAt(id: string, x: number, z: number, radius: number): boolean {
  if (player.on && Math.hypot(player.x - x, player.z - z) < radius) return true;
  const self = roams.get(id);
  let found = false;
  forEachNear(x, z, radius, (o) => {
    if (found || o === self || o.mode === "wander") return;
    if (Math.hypot(o.x - x, o.z - z) < radius) found = true;
  });
  return found;
}

/**
 * Bends the walking direction (ux, uz) around whoever is in the way ahead: the manager and other robots. Each obstacle in
 * front pushes the direction to the side away from it (to a fixed side when it is dead ahead, so two robots do not dither).
 */
export function steerAround(id: string, r: { x: number; z: number }, ux: number, uz: number): [number, number] {
  let sx = 0, sz = 0;
  const consider = (ox: number, oz: number) => {
    const rx = ox - r.x, rz = oz - r.z, d = Math.hypot(rx, rz);
    if (d > LOOK_AHEAD || d < 1e-3) return;
    if (rx * ux + rz * uz <= 0.1 * d) return; // behind us or beside us: not in the way
    const lateral = rx * -uz + rz * ux;       // > 0: obstacle is on our left
    const side = Math.abs(lateral) < 0.15 ? (isOdd(id) ? 1 : -1) : lateral > 0 ? -1 : 1;
    const w = ((LOOK_AHEAD - d) / LOOK_AHEAD) * 1.8;
    sx += -uz * side * w; sz += ux * side * w;
  };
  if (player.on) consider(player.x, player.z);
  const self = roams.get(id);
  forEachNear(r.x, r.z, LOOK_AHEAD, (o) => { if (o !== self) consider(o.x, o.z); });
  if (sx === 0 && sz === 0) return [ux, uz];
  const nx = ux + sx, nz = uz + sz, len = Math.hypot(nx, nz) || 1;
  return [nx / len, nz / len];
}
