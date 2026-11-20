import type { FxKind } from "../fx";
const zap: FxKind = {
  id: "zap", ms: 1100,
  pose: { shake: 0.14, hop: 0.45, spin: Math.PI * 2, tint: "#fff3a0" },
  particles: { count: 10, colors: ["#ffd93d", "#7dd3ff"], size: 0.07, spread: 1.6, rise: 0.4 },
  flash: { color: "#fff6a8", size: 1.1 },
  bolt: true,
};
export default zap;
