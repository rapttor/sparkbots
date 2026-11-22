import { describe, expect, it } from "vitest";
import { WALK_MAX, nearestFree, roomCenter, travelMode } from "../src/world/goto";
import type { NavGrid } from "../src/world/nav";
import type { PlacedZone } from "../src/world/zones";

const room = (id: string, x: number, z: number) => ({ zone: { id }, x, z, w: 10, d: 8 }) as unknown as PlacedZone;

describe("go there", () => {
  it("walks when near and beams when far", () => {
    expect(travelMode({ x: 0, z: 0 }, { x: WALK_MAX - 1, z: 0 })).toBe("walk");
    expect(travelMode({ x: 0, z: 0 }, { x: WALK_MAX + 1, z: 0 })).toBe("beam");
  });
  it("targets a room's centre, but not the middle of the data center", () => {
    expect(roomCenter(room("cafe", 5, 6))).toEqual({ x: 5, z: 6 });
    const dc = roomCenter(room("data-room", 5, 6));
    expect(dc.x).toBeGreaterThan(5);
  });
  it("snaps to the nearest free cell", () => {
    const grid: NavGrid = { ox: 0, oz: 0, cell: 1, w: 5, h: 5, blocked: new Uint8Array(25) };
    expect(nearestFree(grid, 2.5, 2.5)).toEqual({ x: 2.5, z: 2.5 });
    grid.blocked[2 * 5 + 2] = 1; // the centre cell is blocked
    const p = nearestFree(grid, 2.5, 2.5);
    expect(Math.hypot(p.x - 2.5, p.z - 2.5)).toBeCloseTo(1);
    expect(nearestFree(null, 1, 1)).toEqual({ x: 1, z: 1 });
  });
});
