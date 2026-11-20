import type { FxKind } from "../fx";
const wake: FxKind = {
  id: "wake", ms: 1400,
  pose: { hop: 0.1, armUp: 0.9, wiggle: 0.05 },
  particles: { count: 4, colors: ["#ffffff", "#bfe3ff"], size: 0.06, spread: 0.5, rise: 0.8 },
};
export default wake;
