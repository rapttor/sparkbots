import { describe, expect, it } from "vitest";
import { AppDb } from "../server/db";
import { BUMPS, CAFFEINE_MAX, CAFFEINE_START, CaffeineStore, HALF_LIFE_MS, band, bump, decay } from "../server/caffeine";
import { cubiclePieces } from "../src/world/cubicles";
import { nervousPicks, rateLimitedAt } from "../src/world/rateLimit";

describe("caffeine", () => {
  it("halves every half-life and never goes negative", () => {
    expect(decay(80, HALF_LIFE_MS)).toBeCloseTo(40);
    expect(decay(80, 0)).toBe(80);
    expect(decay(80, -5)).toBe(80);
    expect(decay(1, 100 * HALF_LIFE_MS)).toBeGreaterThanOrEqual(0);
  });
  it("bumps by kind and caps at the max", () => {
    expect(bump(10, "coffee")).toBe(10 + BUMPS.coffee);
    expect(bump(10, "food")).toBe(10 + BUMPS.food);
    expect(bump(95, "coffee")).toBe(CAFFEINE_MAX);
  });
  it("bands", () => { expect(band(90)).toBe("wired"); expect(band(40)).toBe("ok"); expect(band(5)).toBe("sleepy"); });
  it("persists per agent in SQLite and decays with time", () => {
    const s = new CaffeineStore(new AppDb(":memory:"));
    expect(s.level("a", 0)).toBe(CAFFEINE_START);
    expect(s.bump("a", "coffee", 0)).toBe(CAFFEINE_START + BUMPS.coffee);
    expect(s.level("a", HALF_LIFE_MS)).toBeCloseTo((CAFFEINE_START + BUMPS.coffee) / 2, 0);
    expect(s.level("b", 0)).toBe(CAFFEINE_START);
    expect(Object.keys(s.all(0))).toEqual(["a"]);
  });
});

describe("rate limited flag helpers", () => {
  it("is limited only until the time passes", () => {
    expect(rateLimitedAt(undefined)).toBe(false);
    expect(rateLimitedAt(1000, 999)).toBe(true);
    expect(rateLimitedAt(1000, 1000)).toBe(false);
  });
  it("rotates a few nervous robots", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    expect(nervousPicks(ids, 0, 3)).toEqual(["a", "b", "c"]);
    expect(nervousPicks(ids, 1, 3)).toEqual(["d", "e", "f"]);
    expect(nervousPicks(["a"], 4, 3)).toEqual(["a"]);
  });
});

describe("cubicle pieces", () => {
  it("puts two walls and three slots around the desk", () => {
    const c = cubiclePieces(10, 20);
    expect(c.walls).toHaveLength(2);
    expect(c.slots).toHaveLength(3);
    expect(c.walls[0]!.z).toBeLessThan(20 - 0.5); // behind the desk
  });
});
