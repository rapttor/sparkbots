import type { Clip } from "../clips";
/** Leans forward and raises one arm as if looking at a phone. */
const checkPhone: Clip = {
  id: "check-phone", kind: "idle", seconds: [3, 5], icon: "📱",
  pose: (t) => { const k = Math.sin(Math.min(1, t / 1) * Math.PI / 2); return { lean: 0.25 * k, wave: 0.6 * k, bob: 0.01 * Math.sin(t * 2) }; },
};
export default checkPhone;
