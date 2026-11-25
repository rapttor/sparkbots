import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_ITEMS, CATALOGUE, LATTICE, MAX_ITEMS, MIN_FLOOR_RADIUS, itemCount, layoutFor, spiralCell } from "../src/shared/unityLayout";

describe("unity layout: the amenity spiral", () => {
  it("starts at the booth and goes around it ring by ring", () => {
    expect(spiralCell(0)).toEqual([0, 0]);
    const ring = (n: number) => Math.max(Math.abs(spiralCell(n)[0]), Math.abs(spiralCell(n)[1]));
    for (let n = 1; n <= 8; n++) expect(ring(n)).toBe(1);
    for (let n = 9; n <= 24; n++) expect(ring(n)).toBe(2);
    for (let n = 25; n <= 48; n++) expect(ring(n)).toBe(3);
  });
  it("never repeats a cell", () => {
    const seen = new Set<string>();
    for (let n = 0; n <= 120; n++) { const c = spiralCell(n).join(","); expect(seen.has(c)).toBe(false); seen.add(c); }
  });
  it("each step moves to a neighbouring cell (a continuous spiral)", () => {
    for (let n = 1; n <= 120; n++) {
      const [ax, az] = spiralCell(n - 1), [bx, bz] = spiralCell(n);
      expect(Math.abs(ax - bx) + Math.abs(az - bz)).toBe(1);
    }
  });
});

describe("unity layout: how many items", () => {
  it("16 up to 32 people, then one more per 4 extra people", () => {
    for (const p of [0, 1, 16, 32]) expect(itemCount(p)).toBe(BASE_ITEMS);
    expect(itemCount(33)).toBe(17);
    expect(itemCount(36)).toBe(17);
    expect(itemCount(37)).toBe(18);
    expect(itemCount(40)).toBe(18);
    expect(itemCount(50)).toBe(21);
  });
  it("is capped and tolerates nonsense", () => {
    expect(itemCount(100000)).toBe(MAX_ITEMS);
    expect(itemCount(-5)).toBe(BASE_ITEMS);
    expect(itemCount(7.9)).toBe(BASE_ITEMS);
  });
});

describe("unity layout: positions", () => {
  it("positions never move when items are added", () => {
    const small = layoutFor(5).items, big = layoutFor(50, CATALOGUE.length).items;
    for (const it of small) expect(big.find((b) => b.id === it.id)).toMatchObject({ x: it.x, z: it.z });
  });
  it("any two items, and any item and the booth, are at least 10 units apart", () => {
    const items = layoutFor(1000, CATALOGUE.length).items;
    for (const a of items) {
      expect(Math.hypot(a.x, a.z)).toBeGreaterThanOrEqual(LATTICE);
      for (const b of items) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(LATTICE);
    }
  });
  it("only draws what has a model (never an empty slot)", () => {
    expect(layoutFor(5, 7).items).toHaveLength(7);
    expect(layoutFor(5).items).toHaveLength(BASE_ITEMS);
    expect(layoutFor(50, 18).items).toHaveLength(18);
  });
  it("every item faces the booth", () => {
    for (const it of layoutFor(5).items) {
      // the model's +z axis, turned by `facing`, must point at the origin
      const fx = Math.sin(it.facing), fz = Math.cos(it.facing);
      expect(fx * it.x + fz * it.z).toBeLessThan(0);
      expect(Math.abs(fx * it.z - fz * it.x)).toBeLessThan(1e-6);
    }
  });
  it("catalogue ids are unique and the floor grows with the items", () => {
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
    expect(layoutFor(0, 0).radius).toBe(MIN_FLOOR_RADIUS);
    expect(layoutFor(5).radius).toBeGreaterThan(layoutFor(5, 7).radius);
    expect(layoutFor(50, CATALOGUE.length).radius).toBeGreaterThanOrEqual(layoutFor(5).radius);
  });
});

describe("unity amenities", () => {
  it("every catalogue entry has a model", () => {
    const src = readFileSync("src/unity/amenities.tsx", "utf8");
    const models = src.slice(src.indexOf("const MODELS"), src.indexOf("export const IMPLEMENTED"));
    for (const c of CATALOGUE) expect(models, c.id).toMatch(new RegExp(`(^|[\\s{,])"?${c.id}"?:`));
  });
  it("amenities are cosmetic: no network, no storage, no new windows", () => {
    const src = ["amenities", "amenities2", "amenityKit"].map((f) => readFileSync(`src/unity/${f}.tsx`, "utf8")).join("\n");
    for (const bad of ["fetch(", "WebSocket", "localStorage", "window.open", "XMLHttpRequest"]) expect(src.includes(bad), bad).toBe(false);
  });
});
