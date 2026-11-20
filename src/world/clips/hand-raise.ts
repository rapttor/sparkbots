import type { Clip } from "../clips";
/** Waiting for you: one hand up, gently waving, a "?" above. */
const handRaise: Clip = {
  id: "hand-raise", kind: "status", state: "waiting", icon: "❓",
  pose: (t) => ({ wave: 0.9 + Math.sin(t * 5) * 0.25, bob: Math.sin(t * 2) * 0.02 }),
};
export default handRaise;
