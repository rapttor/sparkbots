import type { Clip } from "../clips";
/** Arms seesaw quickly with a small bob, as if tossing something. */
const juggle: Clip = {
  id: "juggle", kind: "idle", seconds: [3, 5], icon: "🤹",
  pose: (t) => ({ wave: 0.9 * Math.sin(t * 6), bob: 0.04 * Math.abs(Math.sin(t * 6)) }),
};
export default juggle;
