import type { Clip } from "../clips";
/** Bobs up twice quickly with arms raised, as if shrugging. */
const shrug: Clip = {
  id: "shrug", kind: "idle", seconds: [2, 3], icon: "🤷",
  pose: (t) => { const k = Math.sin(Math.min(1, t / 1.5) * Math.PI); return { bob: 0.1 * Math.abs(Math.sin(t * Math.PI * 2)) * k, wave: 0.6 * k }; },
};
export default shrug;
