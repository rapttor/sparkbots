import type { Clip } from "../clips";
/** Leans over the grill and turns the food: one arm swings back and forth. */
const grillBbq: Clip = {
  id: "grill-bbq", kind: "idle", seconds: [10, 20], icon: "🍖",
  pose: (t) => ({ wave: 0.4 + 0.4 * Math.sin(t * 2.5), lean: 0.15 }),
};
export default grillBbq;
