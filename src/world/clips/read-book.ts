import type { Clip } from "../clips";
/** Leans forward slightly with a gentle sway, as if reading. */
const readBook: Clip = {
  id: "read-book", kind: "idle", seconds: [3, 6], icon: "📖",
  pose: (t) => ({ sway: 0.06 * Math.sin(t * 0.8), lean: 0.2, bob: 0.01 * Math.sin(t * 1.5) }),
};
export default readBook;
