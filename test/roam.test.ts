import { beforeEach, describe, expect, it } from "vitest";
import { roams, separate, type Roam } from "../src/world/roam";

const bot = (x: number, z: number, mode: Roam["mode"], moving: boolean): Roam =>
  ({ x, z, tx: x, tz: z, wait: 0, ry: 0, lying: false, moving, mode, awakeUntil: 0, flash: false, angle: 0, clip: null, icon: "", visit: null, errand: null });

describe("separate", () => {
  beforeEach(() => roams.clear());
  it("pushes a wanderer out of a seated bot, leaving the seated one alone", () => {
    const seated = bot(0, 0, "desk", false), walker = bot(0.2, 0, "wander", false);
    roams.set("a", seated); roams.set("b", walker);
    separate("b", walker); separate("a", seated);
    expect(Math.hypot(walker.x - seated.x, walker.z - seated.z)).toBeGreaterThanOrEqual(0.79);
    expect(seated.x).toBe(0);
  });
  it("does not move a bot that is standing at its desk", () => {
    const a = bot(0, 0, "desk", false), b = bot(0.1, 0, "desk", false);
    roams.set("a", a); roams.set("b", b);
    separate("a", a);
    expect(a.x).toBe(0);
  });
  it("handles two bots on exactly the same spot", () => {
    const a = bot(1, 1, "wander", false), b = bot(1, 1, "desk", false);
    roams.set("a", a); roams.set("b", b);
    separate("a", a);
    expect(Number.isFinite(a.x) && Number.isFinite(a.z)).toBe(true);
    expect(a.x === 1 && a.z === 1).toBe(false);
  });
});

import { followTarget, meeting, player, seatPos } from "../src/world/roam";
describe("followers", () => {
  const room = { x: 0, z: 0, w: 9, d: 7 };
  it("seats are distinct, in two facing rows, and the rows stay inside the table length", () => {
    const seats = Array.from({ length: 10 }, (_, i) => seatPos(room, i, 10));
    expect(new Set(seats.map((s) => `${s.x},${s.z}`)).size).toBe(10);
    expect(seats.filter((s) => s.face === Math.PI)).toHaveLength(5);
    expect(Math.max(...seats.map((s) => Math.abs(s.x)))).toBeLessThanOrEqual(3);
  });
  it("trails behind, huddles when the manager stops, sits when the manager is in the room", () => {
    Object.assign(player, { x: 20, z: 20, hx: 0, hz: -1, still: 0 }); meeting.room = room;
    const trail = followTarget(0, 3);
    expect(trail.kind).toBe("trail");
    expect(trail.z).toBeGreaterThan(20); // behind a manager walking towards -z
    player.still = 2;
    const huddle = followTarget(1, 3);
    expect(huddle.kind).toBe("huddle");
    expect(Math.hypot(huddle.x - 20, huddle.z - 20)).toBeCloseTo(1.6, 1);
    Object.assign(player, { x: 0, z: 0 });
    expect(followTarget(2, 3).kind).toBe("seat");
    meeting.room = null;
  });
});

import { occupiedAt, steerAround } from "../src/world/roam";
describe("going around people", () => {
  beforeEach(() => { roams.clear(); Object.assign(player, { on: false, x: 0, z: 0 }); });
  it("leaves the direction alone when nothing is in the way", () => {
    expect(steerAround("a", { x: 0, z: 0 }, 1, 0)).toEqual([1, 0]);
    Object.assign(player, { on: true, x: -3, z: 0 }); // behind
    expect(steerAround("a", { x: 0, z: 0 }, 1, 0)).toEqual([1, 0]);
  });
  it("bends away from the manager standing ahead on the left or the right", () => {
    Object.assign(player, { on: true, x: 1, z: -0.5 }); // ahead, to the side with smaller z
    const a = steerAround("a", { x: 0, z: 0 }, 1, 0);
    expect(a[1]).toBeGreaterThan(0.05); // goes towards +z, away from the obstacle
    Object.assign(player, { x: 1, z: 0.5 });
    expect(steerAround("a", { x: 0, z: 0 }, 1, 0)[1]).toBeLessThan(-0.05);
  });
  it("picks a side when the obstacle is dead ahead, and the result is a unit vector", () => {
    Object.assign(player, { on: true, x: 1, z: 0 });
    const [x, z] = steerAround("a", { x: 0, z: 0 }, 1, 0);
    expect(Math.abs(z)).toBeGreaterThan(0.05);
    expect(Math.hypot(x, z)).toBeCloseTo(1, 5);
  });
  it("knows when the manager or a seated robot stands on a spot, but ignores wanderers", () => {
    expect(occupiedAt("a", 0, 0, 0.85)).toBe(false);
    Object.assign(player, { on: true, x: 0.3, z: 0 });
    expect(occupiedAt("a", 0, 0, 0.85)).toBe(true);
    player.on = false;
    roams.set("b", { x: 0.2, z: 0, tx: 0, tz: 0, wait: 0, ry: 0, lying: false, moving: false, mode: "wander", awakeUntil: 0, flash: false, angle: 0, clip: null, icon: "", visit: null, errand: null });
    expect(occupiedAt("a", 0, 0, 0.85)).toBe(false);
    roams.get("b")!.mode = "desk";
    expect(occupiedAt("a", 0, 0, 0.85)).toBe(true);
  });
});
