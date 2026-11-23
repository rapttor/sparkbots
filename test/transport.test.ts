import { describe, expect, it } from "vitest";
import { FAR_M, carryAt, droneSeconds, pickRide } from "../src/world/games/transport";

describe("getting to a game table", () => {
  it("near agents walk; far ones are beamed or flown (a coin flip)", () => {
    expect(pickRide(3, 0.1)).toBe("walk");
    expect(pickRide(FAR_M - 0.1, 0.9)).toBe("walk");
    expect(pickRide(FAR_M + 1, 0.2)).toBe("beam");
    expect(pickRide(FAR_M + 1, 0.8)).toBe("drone");
    const rides = new Set(Array.from({ length: 20 }, (_, i) => pickRide(60, i / 20)));
    expect(rides).toEqual(new Set(["beam", "drone"]));
  });
  it("a drone ride takes about a second per 9 m, never less than 3 s or more than 7 s", () => {
    expect(droneSeconds(20)).toBe(3);
    expect(droneSeconds(45)).toBe(5);
    expect(droneSeconds(500)).toBe(7);
  });
  it("the carried agent starts at the start, ends at the table, and the drone lifts off and lands", () => {
    const a = { x: 0, z: 0 }, b = { x: 40, z: -30 };
    const s = carryAt(a, b, 0), m = carryAt(a, b, 0.5), e = carryAt(a, b, 1);
    expect(s.x).toBe(0); expect(e.x).toBeCloseTo(40, 6); expect(e.z).toBeCloseTo(-30, 6);
    expect(m.y).toBeGreaterThan(2); expect(s.y).toBeLessThan(0.3); expect(e.y).toBeLessThan(0.7);
    let prev = -1; for (let k = 0; k <= 1; k += 0.05) { const p = carryAt(a, b, k); expect(p.x).toBeGreaterThanOrEqual(prev - 1e-9); prev = p.x; }
  });
});
