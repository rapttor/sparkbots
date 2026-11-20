import type { Clip } from "../clips";
/** Leans over an imaginary table and jabs the cue arm, again and again. */
const playPool: Clip = {
  id: "play-pool", kind: "idle", seconds: [10, 20], icon: "🎱",
  pose: (t) => ({
    lean: 0.35,
    wave: 0.2 + 0.7 * Math.max(0, Math.sin(t * 3)),
  }),
};
export default playPool;
