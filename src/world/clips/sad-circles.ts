import type { Clip } from "../clips";
/** Problem: shoulders down, walks slow circles around the desk with a red "!" above. */
const sadCircles: Clip = {
  id: "sad-circles", kind: "status", state: "error", icon: "❗",
  orbit: { rx: 1.9, rz: 1.2, speed: 0.55 },
  pose: (t) => ({ lean: 0.35, wave: -0.5 + Math.sin(t * 7) * 0.15, sway: Math.sin(t * 9) * 0.06 }),
};
export default sadCircles;
