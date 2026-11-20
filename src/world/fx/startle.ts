import type { FxKind } from "../fx";
const startle: FxKind = {
  id: "startle", ms: 900,
  pose: { hop: 0.55, spin: 6.283, shake: 0.08 },
  particles: { count: 6, colors: ["#ff9f1c", "#ffd166"], size: 0.08, spread: 1.0, rise: 0.2 },
  flash: { color: "#ffffff", size: 0.4 },
};
export default startle;
