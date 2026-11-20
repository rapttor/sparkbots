import type { Clip } from "../clips";
/** Arms rise and fall slowly as if pressing a barbell, with a small lean back on each press. */
const liftWeights: Clip = {
  id: "lift-weights", kind: "idle", seconds: [10, 20], icon: "🏋️",
  pose: (t) => {
    const press = (1 - Math.cos(t * 1.5)) / 2; // 0 at rest, 1 at full press
    return { wave: 1.2 * press, lean: -0.12 * press };
  },
};
export default liftWeights;
