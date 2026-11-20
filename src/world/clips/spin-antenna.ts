import type { Clip } from "../clips";
/** One full turn on the spot over two seconds, like a robot checking its antenna. */
const spinAntenna: Clip = {
  id: "spin-antenna", kind: "idle", seconds: [2, 2],
  pose: (t) => ({ spin: Math.min(1, t / 2) * 6.283 }),
};
export default spinAntenna;
