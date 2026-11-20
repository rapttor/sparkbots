import type { Clip } from "../clips";
/** Finished: jumps for joy with both hands waving. */
const happyJump: Clip = {
  id: "happy-jump", kind: "status", state: "done", icon: "🎉",
  pose: (t) => ({ hop: Math.abs(Math.sin(t * 6)) * 0.42, wave: Math.sin(t * 14) * 0.9, swing: Math.sin(t * 6) * 0.3 }),
};
export default happyJump;
