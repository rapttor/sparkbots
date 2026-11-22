import { describe, expect, it } from "vitest";
import { FIT_MARGIN, MAX_DIST_CAP, MAX_DIST_MIN, fitDistance, maxZoomDistance, pairSpot } from "../src/world/camera";
import { playChoices, startGame, type PlayHub } from "../src/world/games/playWhileLimited";

describe("max zoom from campus bounds (13.1.4)", () => {
  it("fits the whole campus with a margin", () => {
    const b = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 };
    expect(maxZoomDistance(b)).toBe(Math.round(fitDistance(200) * FIT_MARGIN));
    expect(maxZoomDistance(b)).toBeGreaterThan(fitDistance(200));
  });
  it("is clamped for tiny, degenerate and huge campuses", () => {
    expect(maxZoomDistance({ minX: 0, maxX: 5, minZ: 0, maxZ: 5 })).toBe(MAX_DIST_MIN);
    expect(maxZoomDistance({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 })).toBe(MAX_DIST_MIN);
    expect(maxZoomDistance({ minX: NaN, maxX: 1, minZ: 0, maxZ: 1 })).toBe(MAX_DIST_MIN);
    expect(maxZoomDistance({ minX: 0, maxX: 1e6, minZ: 0, maxZ: 1 })).toBe(MAX_DIST_CAP);
  });
  it("grows with the campus", () => {
    const small = maxZoomDistance({ minX: 0, maxX: 150, minZ: 0, maxZ: 150 });
    const big = maxZoomDistance({ minX: 0, maxX: 300, minZ: 0, maxZ: 300 });
    expect(big).toBeGreaterThan(small);
  });
});

describe("pair-programming spot (13.1.8)", () => {
  const desk = { x: 10, z: 20 };
  it("is beside the desk on the camera's side, never in front of the laptop", () => {
    const r = pairSpot(desk, { x: 30, z: 5 });
    expect(r.side).toBe(1);
    expect(r.cam.x).toBeGreaterThan(desk.x);
    const l = pairSpot(desk, { x: -4, z: 40 });
    expect(l.side).toBe(-1);
    expect(l.cam.x).toBeLessThan(desk.x);
    expect(Math.abs(r.cam.x - desk.x)).toBeGreaterThan(1); // off to the side, not at x = desk.x
  });
});

describe("play while limited (13.4.8)", () => {
  const mk = (over: Partial<PlayHub> = {}): PlayHub => ({ canOpen: () => true, inGame: () => undefined, open: () => ({}), ...over });
  it("offers nothing unless rate limited", () => { expect(playChoices(mk(), "a", false)).toEqual([]); });
  it("lists the available games when limited", () => {
    const c = playChoices(mk({ canOpen: (g) => g === "pong" }), "a", true);
    expect(c.map((x) => x.game)).toEqual(["pong"]);
  });
  it("offers nothing to an agent already in a game, or if the hub throws", () => {
    expect(playChoices(mk({ inGame: () => ({}) }), "a", true)).toEqual([]);
    expect(playChoices(mk({ canOpen: () => { throw new Error("x"); } }), "a", true)).toEqual([]);
  });
  it("startGame reports whether a table opened", () => {
    expect(startGame(mk(), "pong", "a")).toBe(true);
    expect(startGame(mk({ open: () => null }), "pong", "a")).toBe(false);
    expect(startGame(mk({ open: () => { throw new Error("x"); } }), "pong", "a")).toBe(false);
  });
});
