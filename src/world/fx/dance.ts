import type { FxKind } from "../fx";
const dance: FxKind = {
  id: "dance", ms: 4000,
  pose: { wiggle: 0.25, hop: 0.1, armUp: 0.7 },
  particles: { count: 10, colors: ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24"], size: 0.07, spread: 1.1, rise: 1.0, gravity: 0.2 },
};
export default dance;
