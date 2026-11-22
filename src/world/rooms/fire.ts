/** Occasional kitchen fire, cosmetic and OFF by default. Pure scheduler so it can be tested. */
export interface FireState { burning: boolean; since: number; nextAt: number; responders: boolean }
export const FIRE_MIN_GAP_S = 20 * 60, FIRE_MAX_GAP_S = 45 * 60; // quiet time between fires (cooldown)
export const FIRE_BURN_S = 6, FIRE_DRONES_ARRIVE_S = 3, FIRE_OUT_S = 5;

export const initFire = (now: number, rnd = Math.random()): FireState => ({ burning: false, since: 0, nextAt: now + (FIRE_MIN_GAP_S + rnd * (FIRE_MAX_GAP_S - FIRE_MIN_GAP_S)) * 1000, responders: false });

/** `enabled` false: nothing ever ignites (a fire in progress is put out at once). */
export function tickFire(s: FireState, now: number, enabled: boolean, rnd = Math.random()): FireState {
  if (!enabled) return s.burning || s.responders ? { ...initFire(now, rnd) } : s;
  if (!s.burning) return now >= s.nextAt ? { burning: true, since: now, nextAt: 0, responders: false } : s;
  const age = (now - s.since) / 1000;
  if (age >= FIRE_DRONES_ARRIVE_S && !s.responders) s = { ...s, responders: true };
  if (age >= FIRE_DRONES_ARRIVE_S + FIRE_OUT_S) return initFire(now, rnd); // out; cooldown starts
  return s;
}
export const loadFlag = (key: string): boolean => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
export const FIRE_FLAG = "ao.fx.fire";
