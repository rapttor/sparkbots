import type { Clip } from "../clips";
/** A little rocking dance with sway, hops and arm waves. */
const danceIdle: Clip = {
  id: "dance-idle", kind: "idle", seconds: [4, 6], icon: "🎵",
  pose: (t) => ({ sway: 0.25 * Math.sin(t * 4), hop: 0.3 * Math.abs(Math.sin(t * 4)), wave: 0.8 * Math.sin(t * 4 + 1) }),
};
export default danceIdle;
