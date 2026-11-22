import { api } from "../api";
import { decay, band, CAFFEINE_START, type BumpKind } from "../../server/caffeine";

/** Client copy of each agent's caffeine level (the server owns the truth in SQLite). Cosmetic: jitter when wired, yawns when sleepy. */
const known = new Map<string, { value: number; at: number }>();
let start = CAFFEINE_START;

export function caffeineLevel(id: string, now = Date.now()): number {
  const k = known.get(id);
  return k ? decay(k.value, now - k.at) : start;
}
export const caffeineBand = (id: string) => band(caffeineLevel(id));

export async function refreshCaffeine() {
  try {
    const r = await api.caffeine(); const now = Date.now();
    start = r.start; known.clear();
    for (const [id, value] of Object.entries(r.levels)) known.set(id, { value, at: now });
  } catch { /* server busy: keep the old values */ }
}
export function bumpCaffeine(id: string, kind: BumpKind) {
  void api.bumpCaffeine(id, kind).then((r) => known.set(id, { value: r.level, at: Date.now() })).catch(() => {});
}

/** Extra sway / bob for a wired robot (fast small twitch); zero otherwise. */
export function caffeineJitter(id: string, t: number): { sway: number; bob: number } {
  if (caffeineBand(id) !== "wired") return { sway: 0, bob: 0 };
  return { sway: Math.sin(t * 31) * 0.025, bob: Math.sin(t * 23) * 0.012 };
}
