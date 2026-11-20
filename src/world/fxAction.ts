import { playFx } from "./fx";
import { roams } from "./roam";
import type { BotAction } from "./actions";

/** A cosmetic action in one call: play an effect on the agent, and optionally keep a sleeping one awake for a while. */
export function fxAction(o: { key: string; label: string; hint: string; fx: string; wakeMs?: number }): BotAction {
  return {
    key: o.key, label: o.label, hint: o.hint, kind: "fx",
    run: (id) => {
      playFx(o.fx, id);
      const r = roams.get(id);
      if (r && o.wakeMs) r.awakeUntil = performance.now() + o.wakeMs;
    },
  };
}
