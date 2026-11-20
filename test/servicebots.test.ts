import { describe, expect, it } from "vitest";
import { newlyWorking, stepToward } from "../src/world/servicebots";

const d = (id: string, state: string) => ({ worker: { id, state } });

describe("newlyWorking", () => {
  it("first call returns nothing and only records", () => {
    const prev = new Map<string, string>();
    expect(newlyWorking(prev, [d("a", "working"), d("b", "idle")])).toEqual([]);
    expect(prev.get("a")).toBe("working");
  });
  it("returns an id once when it becomes working", () => {
    const prev = new Map<string, string>();
    newlyWorking(prev, [d("a", "idle")]);
    expect(newlyWorking(prev, [d("a", "working")])).toEqual(["a"]);
    expect(newlyWorking(prev, [d("a", "working")])).toEqual([]);
    newlyWorking(prev, [d("a", "done")]);
    expect(newlyWorking(prev, [d("a", "working")])).toEqual(["a"]);
  });
});

describe("stepToward", () => {
  it("moves at speed*dt without arriving", () => {
    const r = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 3.2, 0.5);
    expect(r.arrived).toBe(false);
    expect(r.x).toBeCloseTo(1.6);
  });
  it("arrives and never overshoots", () => {
    const r = stepToward({ x: 0, z: 0 }, { x: 1, z: 1 }, 3.2, 1);
    expect(r).toEqual({ x: 1, z: 1, arrived: true });
  });
  it("uses the flow direction when far and straight when close", () => {
    const far = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 1, 1, { dx: 0, dz: 1 });
    expect(far.z).toBeCloseTo(1);
    const near = stepToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.5, 1, { dx: 0, dz: 1 });
    expect(near.z).toBeCloseTo(0);
    expect(near.x).toBeCloseTo(0.5);
  });
});
