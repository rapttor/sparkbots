import type { Clip } from "../clips";
/** Running on the spot: legs swing fast, the body bobs and the arms seesaw in opposite phase. */
const runInPlace: Clip = {
  id: "run-in-place", kind: "idle", seconds: [10, 20], icon: "🏃",
  pose: (t) => ({
    swing: 0.8 * Math.sin(t * 8),
    bob: 0.06 * Math.abs(Math.sin(t * 8)),
    wave: 0.6 * Math.sin(t * 8 + Math.PI),
  }),
};
export default runInPlace;
