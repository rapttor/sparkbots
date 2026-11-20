import type { FxKind } from "../fx";
const highFive: FxKind = {
  id: "high-five", ms: 1000,
  pose: { armUp: 1.0 },
  particles: { count: 6, colors: ["#ffd93d", "#fff3a0"], size: 0.07, spread: 0.7, rise: 0.3 },
  flash: { color: "#ffe066", size: 0.5 },
};
export default highFive;
