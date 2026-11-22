import { useSyncExternalStore } from "react";

/** Whether the desk furniture is drawn. Off by default: each agent sits in a glass cubicle with a laptop floating in it (desks are walk-through anyway). Browser-local. */
const KEY = "ao.showDesks";
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const subs = new Set<() => void>();

export const getShowDesks = (): boolean => on;
export function setShowDesks(v: boolean): void {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  for (const f of subs) f();
}
export const useShowDesks = (): boolean => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, getShowDesks);
