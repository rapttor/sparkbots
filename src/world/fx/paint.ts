import type { FxKind } from "../fx";
const paint: FxKind = {
  id: "paint", ms: 1500,
  pose: { tint: "#e879f9", shake: 0.03 },
  particles: { count: 14, colors: ["#e879f9", "#22d3ee", "#facc15"], size: 0.06, spread: 1.3, rise: 0.5 },
};
export default paint;
