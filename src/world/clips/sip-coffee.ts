import type { Clip } from "../clips";
/** Raises an arm to the head and back, twice, as if sipping a drink. */
const sipCoffee: Clip = {
  id: "sip-coffee", kind: "idle", seconds: [4, 6], icon: "☕",
  pose: (t) => ({ wave: 0.9 * Math.max(0, Math.sin(t * Math.PI)), lean: 0.05 * Math.max(0, Math.sin(t * Math.PI)) }),
};
export default sipCoffee;
