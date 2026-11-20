import { describe, expect, it } from "vitest";
import { DESK_D, DESK_W, deskBoxes, resolveMove } from "../src/world/collide";

const boxes = deskBoxes([{ x: 0, z: 0 }]);
const R = 0.35;

describe("resolveMove", () => {
  it("leaves free movement unchanged", () => {
    expect(resolveMove({ x: 5, z: 5 }, { x: 5.2, z: 5.1 }, boxes, R)).toEqual({ x: 5.2, z: 5.1 });
  });
  it("pushes a player inside a desk out", () => {
    const r = resolveMove({ x: 0.1, z: 0 }, { x: 0.2, z: 0.1 }, boxes, R);
    const inside = r.x > -DESK_W / 2 - R && r.x < DESK_W / 2 + R && r.z > -DESK_D / 2 - R && r.z < DESK_D / 2 + R;
    expect(inside).toBe(false);
  });
  it("slides along an edge", () => {
    // approaching the +Z face while moving diagonally: Z blocked, X preserved
    const r = resolveMove({ x: 0, z: 1.2 }, { x: 0.3, z: 0.6 }, boxes, R);
    expect(r.x).toBeCloseTo(0.3);
    expect(r.z).toBeCloseTo(DESK_D / 2 + R);
  });
});
