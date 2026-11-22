import type { FxKind } from "../fx";
/** Nervous mode (13.4.7): played at random bots while the model service is rate limited. Cosmetic: states are untouched. */
export const NERVOUS_BUBBLE = "#ff4d4d"; // speech bubbles are tinted this while rate limited
const nervous: FxKind = {
  id: "nervous", ms: 1400,
  pose: { shake: 0.07, wiggle: 0.08, tint: "#ff6b6b" },
  particles: { count: 4, colors: ["#ff4d4d", "#ffb3b3"], size: 0.05, spread: 0.6, rise: 0.1 },
};
export default nervous;
