import { describe, expect, it } from "vitest";
import { ZONES, zoneProblems } from "../src/world/zones";
import { CLIPS } from "../src/world/clips";
import { computeLayout } from "../src/world/layout";
import { makeFixtureSnapshot } from "../src/world/fixture";
import { buildNav, Flow } from "../src/world/nav";
import { deskBoxes } from "../src/world/collide";

describe("zones", () => {
  it("every zone is valid and ids are unique", () => {
    expect(ZONES.length).toBeGreaterThan(0);
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    for (const z of ZONES) expect(zoneProblems(z), z.id).toEqual([]);
  });
  it("POIs stand on free floor and name clips that exist", () => {
    const clipIds = new Set(CLIPS.map((c) => c.id));
    for (const z of ZONES) for (const q of z.pois) {
      const inside = z.props.find((p) => p.solid !== false && Math.abs(q.at[0] - p.at[0]) < p.size[0] / 2 + 0.3 && Math.abs(q.at[1] - p.at[1]) < p.size[2] / 2 + 0.3);
      expect(inside, `${z.id}:${q.id} is inside a solid prop`).toBeUndefined();
      if (q.clip) expect(clipIds.has(q.clip), `${z.id}:${q.id} clip ${q.clip}`).toBe(true);
    }
  });
  it("the campus layout places every zone without overlapping team areas", () => {
    const l = computeLayout(makeFixtureSnapshot(40));
    expect(l.zones.length).toBe(ZONES.length);
    for (const z of l.zones) for (const a of l.areas) {
      const overlap = Math.abs(z.x - a.x) < (z.w + a.w) / 2 - 0.01 && Math.abs(z.z - a.z) < (z.d + a.d) / 2 - 0.01;
      expect(overlap, `${z.zone.id} overlaps ${a.name}`).toBe(false);
    }
  });
  it("every POI can be reached from the first desk (no zone is walled off)", () => {
    const l = computeLayout(makeFixtureSnapshot(40));
    const boxes = [...deskBoxes(l.desks), ...l.zones.flatMap((z) => z.props.filter((p) => p.solid).map((p) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 })))];
    const flow = new Flow(buildNav(l, boxes));
    const from = l.desks[0]!;
    for (const z of l.zones) for (const q of z.pois) {
      const dir = flow.dir(from.x, from.z + 0.95, flow.field(q.x, q.z));
      expect(dir, `${q.id} unreachable`).not.toBeNull();
    }
  });
});
