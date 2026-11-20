import type { Clip } from "../clips";
/** Turns left and right as if checking the room. */
const lookAround: Clip = {
  id: "look-around", kind: "idle", seconds: [3, 5],
  pose: (t) => ({ spin: Math.sin(t * 1.6) * 0.9, bob: Math.sin(t * 3) * 0.01 }),
};
export default lookAround;
