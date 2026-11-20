import type { Clip } from "../clips";
/** Leans back and lifts an arm slowly, as if yawning. */
const yawn: Clip = {
  id: "yawn", kind: "idle", seconds: [3, 5], icon: "🥱",
  pose: (t) => { const k = Math.sin(Math.min(1, t / 3) * Math.PI); return { lean: -0.3 * k, wave: 0.9 * k, bob: 0.03 * k }; },
};
export default yawn;
