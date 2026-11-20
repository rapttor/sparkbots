import type { Clip } from "../clips";
/** Arms seesaw fast on the rods while the body sways a little. */
const playFoosball: Clip = {
  id: "play-foosball", kind: "idle", seconds: [10, 20], icon: "⚽",
  pose: (t) => ({
    wave: 0.7 * Math.sin(t * 10),
    sway: 0.1 * Math.sin(t * 2),
  }),
};
export default playFoosball;
