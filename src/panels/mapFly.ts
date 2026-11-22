import type { PlacedZone } from "../world/zones";

const inside = (p: { x: number; z: number }, r: PlacedZone) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2;

/**
 * Where "Fly to <room>" puts the manager: just in front of the room's south edge so the camera behind looks into it.
 * When another room sits right there (the sponsor room south of the game room) the spot would be inside that room, so the
 * manager stands just inside the south wall of the room itself instead.
 */
export function roomFlyPoint(zones: PlacedZone[], room: PlacedZone): { x: number; z: number } {
  const front = { x: room.x, z: room.z + room.d / 2 + 2 };
  if (!zones.some((o) => o !== room && inside(front, o))) return front;
  return { x: room.x, z: room.z + room.d / 2 - 1 };
}
