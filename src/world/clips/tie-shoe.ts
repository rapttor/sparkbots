import type { Clip } from "../clips";
/** Bends forward and holds, with a small bob as if tying a shoe. */
const tieShoe: Clip = {
  id: "tie-shoe", kind: "idle", seconds: [3, 5],
  pose: (t) => { const k = Math.sin(Math.min(1, t / 1) * Math.PI / 2); return { lean: 0.35 * k, bob: -0.04 * k + 0.01 * Math.sin(t * 6) }; },
};
export default tieShoe;
