import { describe, expect, it } from "vitest";
import { roomFlyPoint } from "../src/panels/mapFly";
import { placeZone, ZONES } from "../src/world/zones";
import { computeLayout } from "../src/world/layout";

describe("roomFlyPoint", () => {
  it("never lands inside another room (every room in the real layout)", () => {
    const layout = computeLayout({ teams: [] } as never, false);
    for (const z of layout.zones) {
      const p = roomFlyPoint(layout.zones, z);
      const hit = layout.zones.find((o) => o !== z && Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.z - o.z) <= o.d / 2);
      expect(hit?.zone.id, `${z.zone.id} -> ${hit?.zone.id}`).toBeUndefined();
    }
  });
  it("uses the spot in front of a free south edge", () => {
    const a = placeZone(ZONES[0]!, 0, 0);
    expect(roomFlyPoint([a], a)).toEqual({ x: 0, z: a.d / 2 + 2 });
  });
});
