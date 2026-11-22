/** Cosmetic drone flights (pure). A straight line between two points at flying height: no pathfinding, no collisions. */
export interface P { x: number; z: number }
export const FLY_H = 2.4;
export const OUT_S = 2.2, HOVER_S = 1.2, BACK_S = 2.0;
export const FLIGHT_S = OUT_S + HOVER_S + BACK_S;
export const FOOD_CHANCE = 0.3;   // of "agent starts work" events get a meal instead of (or besides) a coffee
export const MAX_FLIGHTS = 4;

export type Leg = "out" | "hover" | "back" | "done";
export function flight(home: P, target: P, t: number): { x: number; y: number; z: number; leg: Leg; carrying: boolean } {
  const lerp = (a: P, b: P, k: number) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
  if (t < OUT_S) { const k = t / OUT_S, p = lerp(home, target, k); return { ...p, y: 0.8 + (FLY_H - 0.8) * Math.min(1, k * 3), leg: "out", carrying: true }; }
  if (t < OUT_S + HOVER_S) { const k = (t - OUT_S) / HOVER_S; return { x: target.x, z: target.z, y: FLY_H - k * 0.9, leg: "hover", carrying: k < 0.6 }; }
  if (t < FLIGHT_S) { const k = (t - OUT_S - HOVER_S) / BACK_S, p = lerp(target, home, k); return { ...p, y: FLY_H - 0.9 + 0.9 * Math.min(1, k * 2), leg: "back", carrying: false }; }
  return { ...home, y: 0.8, leg: "done", carrying: false };
}

/** Listeners told when a meal lands (the caffeine feature can subscribe and add a little). Never required. */
type Listener = (agentId: string) => void;
const foodListeners = new Set<Listener>();
export const onFoodDelivered = (f: Listener): (() => void) => { foodListeners.add(f); return () => { foodListeners.delete(f); }; };
export const emitFoodDelivered = (id: string): void => { for (const f of foodListeners) f(id); };
