import type { Clip } from "../clips";
/** The conductor ("dirigent"): an agent with working sub-agents waves a baton in time, leaning slightly towards them. */
const conduct: Clip = {
  id: "conduct", kind: "special", icon: "🎼",
  pose: (t) => ({ wave: Math.sin(t * 5) * 0.9, lean: 0.12, sway: Math.sin(t * 2.5) * 0.08, bob: Math.abs(Math.sin(t * 5)) * 0.02 }),
};
export default conduct;
