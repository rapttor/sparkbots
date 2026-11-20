import { roams } from "./roam";

/** Things the manager can do to the nearest robot in walk mode. Add an entry here to add a key binding (and its help text). */
export interface BotAction {
  key: string;
  label: string;
  hint: string;
  run: (workerId: string) => void;
}

export const ZAP_MS = 1100;
const zapAt = new Map<string, number>(); // worker id -> performance.now() of the zap
const AWAKE_MS = 15_000;

/** 0 (not zapped) .. 1 (just zapped), fading out over ZAP_MS. */
export function zapLevel(id: string, now = performance.now()): number {
  const t = zapAt.get(id);
  if (t === undefined) return 0;
  const l = 1 - (now - t) / ZAP_MS;
  if (l <= 0) { zapAt.delete(id); return 0; }
  return l;
}
export const activeZaps = (now = performance.now()) =>
  [...zapAt.entries()].filter(([, t]) => now - t < ZAP_MS).sort((a, b) => a[1] - b[1]).map(([id]) => id);

/** Visual only: shakes and hops the robot, flashes it, and wakes a sleeping one for a while. Touches no session. */
export const ACTIONS: BotAction[] = [
  {
    key: "z", label: "Zap", hint: "zap the closest robot (wakes sleepers)",
    run: (id) => {
      const now = performance.now();
      zapAt.set(id, now);
      const r = roams.get(id);
      if (r) r.awakeUntil = now + AWAKE_MS;
    },
  },
];
