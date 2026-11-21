import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLY_MIN, FLY_SPEED, REDUCED_MAX, advance, clamp01, flyDuration, flyDurationFor, flyPeak, smooth, worldPerPixel } from "../src/world/camera";

describe("camera flight math (13.1.13)", () => {
  it("eases with no overshoot and hits both ends exactly", () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    for (let t = -0.5; t <= 1.5; t += 0.01) expect(smooth(t)).toBeGreaterThanOrEqual(0);
    for (let t = -0.5; t <= 1.5; t += 0.01) expect(smooth(t)).toBeLessThanOrEqual(1);
    // monotonic across the whole range
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) { const e = smooth(t); expect(e).toBeGreaterThanOrEqual(prev); prev = e; }
  });

  it("advances monotonically and clamps to 1 (never overshoots)", () => {
    let t = 0;
    for (let i = 0; i < 500; i++) {
      const next = advance(t, 0.22, 0.016);
      expect(next).toBeGreaterThanOrEqual(t);
      expect(next).toBeLessThanOrEqual(1);
      t = next;
    }
    expect(t).toBe(1);
  });

  it("never jumps backwards even with a huge frame", () => {
    expect(advance(0.4, 0.22, 10)).toBe(1);
    expect(advance(1, 0.22, 10)).toBe(1);
    expect(clamp01(-3)).toBe(0);
  });

  it("never drops below FLY_MIN and grows with distance", () => {
    expect(flyDuration(0)).toBe(FLY_MIN);
    expect(flyDuration(1)).toBe(FLY_MIN);
    expect(flyDuration(200)).toBeGreaterThan(flyDuration(20));
    expect(flyDuration(20)).toBeGreaterThanOrEqual(FLY_MIN);
  });

  it("respects the peak speed cap (and therefore the per-frame delta) for every distance", () => {
    for (let d = 0; d <= 5000; d += 7) expect(flyPeak(d)).toBeLessThanOrEqual(FLY_SPEED + 1e-9);
  });

  it("hand mode: one pixel covers more world when zoomed out, less when zoomed in", () => {
    const near = worldPerPixel(10, 50, 900);
    const far = worldPerPixel(40, 50, 900);
    expect(far).toBeGreaterThan(near);
    expect(far / near).toBeCloseTo(4); // linear in camera distance
    expect(worldPerPixel(10, 50, 1800)).toBeLessThan(near); // taller viewport = finer
  });

  it("fast mode is quicker and reduced motion caps the flight (13.1.14)", () => {
    const normal = flyDurationFor(300, { speed: "normal", reduced: false });
    const fast = flyDurationFor(300, { speed: "fast", reduced: false });
    expect(fast).toBeLessThan(normal);
    expect(flyDurationFor(300, { speed: "normal", reduced: true })).toBeLessThanOrEqual(REDUCED_MAX);
    expect(flyDurationFor(1, { speed: "fast", reduced: false })).toBeGreaterThanOrEqual(FLY_MIN);
  });
});

describe("World.tsx camera continuity (13.1.13)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/world/World.tsx", import.meta.url)), "utf8");
  const hits = (re: RegExp) => (src.match(re) ?? []).length;

  it("has no direct camera.position.set calls (all moves fly through flyTo)", () => {
    expect(hits(/camera\.position\.set\(/g)).toBe(0);
  });

  it("only snaps the camera once, on the instant initial frame", () => {
    // the single allowed exception: the first overview frame before any flight exists
    expect(hits(/camera\.position\.copy\(/g)).toBe(1);
  });
});
