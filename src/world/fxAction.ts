import { playFx } from "./fx";
import { roams } from "./roam";
import type { BotAction } from "./actions";

const WAKE_DELAY_MS = 900; // how long the wake-up shows before the chosen effect

/** A cosmetic action in one call: play an effect on the agent, and optionally keep a sleeping one awake for a while. */
export function fxAction(o: { key: string; label: string; hint: string; icon?: string; color?: string; fx: string; wakeMs?: number }): BotAction {
  return {
    key: o.key, label: o.label, hint: o.hint, icon: o.icon, color: o.color, kind: "fx",
    run: (id, w) => {
      // Every performance wakes the agent first: a sleeper gets a short wake-up, then the effect plays.
      const r = roams.get(id), now = performance.now();
      const sleeping = w?.state === "asleep" && !(r && r.awakeUntil > now);
      if (r) r.awakeUntil = Math.max(r.awakeUntil, now + (o.wakeMs ?? 10_000) + (sleeping ? WAKE_DELAY_MS : 0));
      if (sleeping && o.fx !== "wake") { playFx("wake", id); setTimeout(() => playFx(o.fx, id), WAKE_DELAY_MS); } else playFx(o.fx, id);
    },
  };
}
