import type { NavGrid } from "./nav";
import type { PlacedZone } from "./zones";

/** Up to this distance "Go there" walks; farther away you are transported (dematerialize here, materialize there). */
export const WALK_MAX = 14;
export type Travel = "walk" | "beam";
export const travelMode = (from: { x: number; z: number }, to: { x: number; z: number }): Travel => (Math.hypot(to.x - from.x, to.z - from.z) <= WALK_MAX ? "walk" : "beam");

/** The spot to stand on in a room: its centre, except rooms whose middle is full of furniture (the data center's racks: use the console side). */
export function roomCenter(room: PlacedZone): { x: number; z: number } {
  if (room.zone.id === "data-room") return { x: room.x + 3.2, z: room.z + 0.6 };
  return { x: room.x, z: room.z };
}

/** The nearest walkable point to (x, z): the point itself when free, else the closest free cell centre within `maxR` cells. */
export function nearestFree(grid: NavGrid | null | undefined, x: number, z: number, maxR = 10): { x: number; z: number } {
  if (!grid) return { x, z };
  const cx = Math.floor((x - grid.ox) / grid.cell), cz = Math.floor((z - grid.oz) / grid.cell);
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < grid.w && j < grid.h && !grid.blocked[j * grid.w + i];
  if (free(cx, cz)) return { x, z };
  let best: { i: number; j: number; d: number } | null = null;
  for (let r = 1; r <= maxR && !best; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !free(cx + dx, cz + dz)) continue;
      const d = dx * dx + dz * dz;
      if (!best || d < best.d) best = { i: cx + dx, j: cz + dz, d };
    }
  }
  return best ? { x: grid.ox + (best.i + 0.5) * grid.cell, z: grid.oz + (best.j + 0.5) * grid.cell } : { x, z };
}
