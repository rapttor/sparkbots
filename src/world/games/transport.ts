/** How an agent gets to a game table. Walking across the campus takes minutes, so a far-away agent is beamed up or carried by a drone (a coin flip). Pure. */
export const FAR_M = 16;               // farther than this from the table: no walking
export type Ride = "walk" | "beam" | "drone";

export function pickRide(dist: number, roll: number): Ride {
  if (dist < FAR_M) return "walk";
  return roll < 0.5 ? "beam" : "drone";
}
/** A drone ride takes about one second per 9 m, between 3 and 7 seconds. */
export const droneSeconds = (dist: number): number => Math.max(3, Math.min(7, dist / 9));

export interface P2 { x: number; z: number }
/** Where the carried agent is at `k` (0..1) of the ride: a smooth line, with the drone's height (a lift-off, a cruise arc, a gentle landing). */
export function carryAt(from: P2, to: P2, k: number): { x: number; z: number; y: number } {
  const u = Math.max(0, Math.min(1, k)), e = u * u * (3 - 2 * u); // smoothstep
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e, y: 0.1 + Math.sin(Math.PI * Math.min(1, u * 1.05)) * 2.4 };
}
