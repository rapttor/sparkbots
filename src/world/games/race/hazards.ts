import { HALF_WIDTH, pointAt, type Track } from "./track";
import type { Rng } from "../types";

/** Things on and beside the road (13.7.10): potholes, oil, tyre stacks (decor), and mini robots that run across the road. Pure. */
export interface Hazard { kind: "pothole" | "oil"; x: number; z: number; r: number; s: number }
export interface TyreStack { x: number; z: number; n: number }
export interface Pickup { x: number; z: number; s: number }
export interface Decor { hazards: Hazard[]; tyres: TyreStack[]; crossAt: number[]; pickups: Pickup[] }

const turnNear = (t: Track, s: number, span: number): number => {
  const a = pointAt(t, s - span), b = pointAt(t, s + span);
  return Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz); // > 0: turning right (z grows)
};

/** Deterministic for a track and seed: the same road always has the same potholes. */
export function genDecor(t: Track, rng: Rng): Decor {
  const hazards: Hazard[] = [], tyres: TyreStack[] = [], crossAt: number[] = [], pickups: Pickup[] = [];
  const edge = HALF_WIDTH + 1.0;
  for (let s = 30; s < t.length - 20; s += 28 + rng() * 22) {
    const k = rng();
    if (k > 0.7) continue;
    const p = pointAt(t, s), lat = (rng() - 0.5) * 2 * (HALF_WIDTH - 1.3), n = { x: -p.tz, z: p.tx };
    hazards.push({ kind: k < 0.42 ? "pothole" : "oil", x: p.x + n.x * lat, z: p.z + n.z * lat, r: k < 0.42 ? 0.9 : 1.8, s });
  }
  for (let s = 6; s < t.length; s += 3) {
    const turn = turnNear(t, s, 6);
    const bend = Math.abs(turn) > 0.3, rare = rng() < 0.02;
    if (!bend && !rare) continue;
    if (bend && rng() > 0.45) continue;
    const p = pointAt(t, s), side = bend ? -Math.sign(turn) : rng() < 0.5 ? -1 : 1, off = side * edge;
    tyres.push({ x: p.x - p.tz * off, z: p.z + p.tx * off, n: 1 + Math.floor(rng() * 3) });
  }
  for (let k = 0; k < 4; k++) crossAt.push(((k + 0.25 + rng() * 0.5) / 4) * t.length);
  // item boxes: a row of three across the road every ~65 m (not at the start line)
  for (let s = 45; s < t.length - 25; s += 55 + rng() * 20) {
    const p = pointAt(t, s);
    for (const lat of [-1.6, 0, 1.6]) pickups.push({ x: p.x - p.tz * lat, z: p.z + p.tx * lat, s });
  }
  return { hazards, tyres, crossAt, pickups };
};

/** A mini robot that waits at the roadside, runs across, and gets knocked flat if a car hits it. */
export interface Crosser { s: number; side: 1 | -1; lat: number; phase: "wait" | "run" | "flat"; timer: number; x: number; z: number; color: string }
export const CROSS_SPEED = 2.6;
const COLORS = ["#4cc9f0", "#f72585", "#b5e48c", "#ffb703", "#9d4edd"];

export function makeCrossers(t: Track, at: number[], rng: Rng): Crosser[] {
  return at.map((s, i) => { const c: Crosser = { s, side: rng() < 0.5 ? 1 : -1, lat: 0, phase: "wait", timer: 2 + rng() * 8, x: 0, z: 0, color: COLORS[i % COLORS.length]! }; place(t, c); return c; });
}
function place(t: Track, c: Crosser): void {
  const p = pointAt(t, c.s), lat = c.lat;
  c.x = p.x - p.tz * lat; c.z = p.z + p.tx * lat;
}
export function stepCrossers(t: Track, list: Crosser[], dt: number, rng: Rng): void {
  const edge = HALF_WIDTH + 1.2;
  for (const c of list) {
    if (c.phase === "wait") { c.lat = c.side * -edge; c.timer -= dt; if (c.timer <= 0) c.phase = "run"; }
    else if (c.phase === "run") { c.lat += c.side * CROSS_SPEED * dt; if (c.lat * c.side >= edge) { c.phase = "wait"; c.side = (c.side * -1) as 1 | -1; c.timer = 4 + rng() * 9; } }
    else { c.timer -= dt; if (c.timer <= 0) { c.phase = "wait"; c.timer = 3 + rng() * 6; c.lat = c.side * -edge; } }
    place(t, c);
  }
}
