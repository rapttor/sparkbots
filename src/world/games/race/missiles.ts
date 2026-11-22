/** Missiles (13.7.10): they fly straight along the heading they were fired with. No homing, no curving, no following the road.
 *  A missile ends by hitting a car, by running out of lifetime, or by leaving the track area. Pure. */
export interface Missile { owner: string; x: number; z: number; vx: number; vz: number; age: number; dist: number }
export interface Target { id: string; x: number; z: number; r: number }
export type MissileState = "alive" | "hit" | "expired" | "wall";
export interface MissileResult { state: MissileState; hit?: string }

export const MISSILE_SPEED = 60;     // m/s: much faster than any car, so a shot can catch one
export const MISSILE_LIFE = 2.5;     // s
export const MISSILE_RANGE = 130;    // m
export const MISSILE_RADIUS = 0.6;
export const MAX_MISSILES = 6;       // alive at once, all drivers together

export const fireMissile = (owner: string, x: number, z: number, heading: number): Missile => ({
  owner, x: x + Math.cos(heading) * 1.6, z: z + Math.sin(heading) * 1.6, vx: Math.cos(heading) * MISSILE_SPEED, vz: Math.sin(heading) * MISSILE_SPEED, age: 0, dist: 0,
});

/** Distance from point p to the segment a-b. */
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};

/**
 * Advance one missile by dt (it mutates `m`). The hit test sweeps the step, so a fast missile cannot jump over a car.
 * `inside(x, z)` says whether a spot is still on the track area (road + the off-road strip); leaving it ends the flight.
 */
export function missileStep(m: Missile, dt: number, targets: Target[], inside: (x: number, z: number) => boolean = () => true): MissileResult {
  const ox = m.x, oz = m.z;
  m.x += m.vx * dt; m.z += m.vz * dt; m.age += dt; m.dist += Math.hypot(m.vx, m.vz) * dt;
  for (const t of targets) if (t.id !== m.owner && segDist(t.x, t.z, ox, oz, m.x, m.z) < t.r + MISSILE_RADIUS) return { state: "hit", hit: t.id };
  if (!inside(m.x, m.z)) return { state: "wall" };
  if (m.age >= MISSILE_LIFE || m.dist >= MISSILE_RANGE) return { state: "expired" };
  return { state: "alive" };
}
