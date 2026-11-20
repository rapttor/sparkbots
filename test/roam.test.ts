import { beforeEach, describe, expect, it } from "vitest";
import { roams, separate, type Roam } from "../src/world/roam";

const bot = (x: number, z: number, mode: Roam["mode"], moving: boolean): Roam =>
  ({ x, z, tx: x, tz: z, wait: 0, ry: 0, lying: false, moving, mode, awakeUntil: 0, flash: false });

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
