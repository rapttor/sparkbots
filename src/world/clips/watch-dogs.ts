import type { Clip } from "../clips";
/** Watches the robot dogs play: a slow small turn left and right with a gentle sway. */
const watchDogs: Clip = {
  id: "watch-dogs", kind: "idle", seconds: [10, 20], icon: "🐕",
  pose: (t) => ({ spin: 0.5 * Math.sin(t * 0.8), sway: 0.15 * Math.sin(t * 0.8) }),
};
export default watchDogs;
