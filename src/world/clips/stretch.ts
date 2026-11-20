import type { Clip } from "../clips";
/** Arms up, a little lean back, then relax. */
const stretch: Clip = {
  id: "stretch", kind: "idle", seconds: [2.5, 4],
  pose: (t) => { const k = Math.sin(Math.min(1, t / 2.5) * Math.PI); return { wave: 1.1 * k, lean: -0.15 * k, bob: 0.05 * k }; },
};
export default stretch;
