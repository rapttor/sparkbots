import type { AppDb } from "./db";

/** Caffeine level per agent, 0..100. Cosmetic only (jitter / yawn); never touches a session. */
export const CAFFEINE_START = 40;
export const CAFFEINE_MAX = 100;
export const HALF_LIFE_MS = 2 * 3_600_000; // the level halves every two hours
export const BUMPS = { coffee: 35, food: 15 } as const;
export type BumpKind = keyof typeof BUMPS;

const clamp = (v: number) => Math.max(0, Math.min(CAFFEINE_MAX, v));
/** Level after `dtMs` without a drink. Exponential decay; never below 0. */
export const decay = (value: number, dtMs: number): number => clamp(value * Math.pow(0.5, Math.max(0, dtMs) / HALF_LIFE_MS));
/** Level after a coffee / snack (capped at the max). */
export const bump = (value: number, kind: BumpKind): number => clamp(value + BUMPS[kind]);
/** Cosmetic bands: jittery above 75, yawning below 15. */
export const band = (value: number): "wired" | "ok" | "sleepy" => (value >= 75 ? "wired" : value < 15 ? "sleepy" : "ok");

export class CaffeineStore {
  constructor(private readonly db: AppDb) {}
  level(session: string, now = Date.now()): number {
    const r = this.db.caffeineRow(session);
    return r ? Math.round(decay(r.value, now - r.at) * 10) / 10 : CAFFEINE_START;
  }
  /** Current level of every agent that has a stored value (others are at CAFFEINE_START). */
  all(now = Date.now()): Record<string, number> {
    return Object.fromEntries(this.db.caffeineAll().map((r) => [r.session, Math.round(decay(r.value, now - r.at) * 10) / 10]));
  }
  bump(session: string, kind: BumpKind, now = Date.now()): number {
    const v = bump(this.level(session, now), kind);
    this.db.caffeineSet(session, v, now);
    return Math.round(v * 10) / 10;
  }
}
