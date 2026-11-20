/** Where a bot currently is. Bots leave their chair when idle (wander), lie down when asleep, and run back to the
 *  desk when they are working or when you open their chat. */
export type BotMode = "desk" | "wander" | "sleep" | "rush";
export interface Roam {
  x: number; z: number; tx: number; tz: number; wait: number; ry: number; lying: boolean; moving: boolean;
  mode: BotMode;
  awakeUntil: number; // performance.now() until which a sleeping bot stays up (after being zapped)
  flash: boolean;     // body color is currently tinted by an action and must be restored
}
export const roams = new Map<string, Roam>();
/** The manager's position in walk mode (null in overview): bots step out of the way. */
export const player: { x: number; z: number; on: boolean } = { x: 0, z: 0, on: false };

const SEP = 0.8;        // bots keep at least this far apart
const PLAYER_SEP = 0.95;

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
  for (const [oid, o] of roams) {
    if (oid === id) continue;
    if (r.mode !== "wander" && o.mode === "wander") continue; // the wanderer yields to us
    push(o.x, o.z, SEP, o.moving && (o.mode === "wander" || r.mode === "wander") ? 0.5 : 1);
  }
  if (player.on) push(player.x, player.z, PLAYER_SEP, 1);
}

/** Pushes the manager out of any bot it overlaps (returns the corrected position). */
export function pushPlayerOut(p: { x: number; z: number }): void {
  for (const o of roams.values()) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < 0.7 && d > 1e-3) { const k = (0.7 - d) / d; p.x += dx * k; p.z += dz * k; }
  }
}
