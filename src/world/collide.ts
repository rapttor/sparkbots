export interface Vec2 { x: number; z: number }
export interface Aabb { minX: number; maxX: number; minZ: number; maxZ: number }

export const DESK_W = 2.2;
export const DESK_D = 1.0;
export const PLAYER_RADIUS = 0.35;

export function deskBoxes(desks: Vec2[]): Aabb[] {
  return desks.map((d) => ({ minX: d.x - DESK_W / 2, maxX: d.x + DESK_W / 2, minZ: d.z - DESK_D / 2, maxZ: d.z + DESK_D / 2 }));
}

const hits = (x: number, z: number, b: Aabb, r: number) =>
  x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;

/** Moves from `pos` to `next`, resolving X and Z separately so the player slides along desks. */
export function resolveMove(pos: Vec2, next: Vec2, desks: Aabb[], radius: number): Vec2 {
  let x = next.x;
  let z = pos.z;
  for (const b of desks) {
    if (!hits(x, z, b, radius)) continue;
    x = pos.x <= (b.minX + b.maxX) / 2 ? b.minX - radius : b.maxX + radius;
  }
  z = next.z;
  for (const b of desks) {
    if (!hits(x, z, b, radius)) continue;
    z = pos.z <= (b.minZ + b.maxZ) / 2 ? b.minZ - radius : b.maxZ + radius;
  }
  return { x, z };
}
