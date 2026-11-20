import type { Clip } from "../clips";
/** Works a pan: one arm seesaws over the pan while the body bobs gently. */
const cook: Clip = {
  id: "cook", kind: "idle", seconds: [10, 20], icon: "🍳",
  pose: (t) => ({ wave: 0.5 + 0.4 * Math.sin(t * 2), bob: 0.04 * Math.sin(t * 3) }),
};
export default cook;
