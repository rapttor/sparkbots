import type { Clip } from "../clips";
/** Quick small leg swings with a tiny bob, as if tapping a foot. */
const tapFoot: Clip = {
  id: "tap-foot", kind: "idle", seconds: [3, 5],
  pose: (t) => ({ swing: 0.25 * Math.sin(t * 8), bob: 0.01 * Math.abs(Math.sin(t * 8)) }),
};
export default tapFoot;
