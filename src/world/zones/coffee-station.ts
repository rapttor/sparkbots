import type { Zone } from "../zones";
/** Coffee station: a counter with a machine; robots queue for a cup. */
const z: Zone = {
  id: "coffee-station", name: "Coffee station", place: "center", size: [6, 4], floor: "#2a2118",
  props: [
    { at: [0, -1.2], size: [4, 1, 1], color: "#5b3a24" },                         // counter
    { at: [-1, -1.2], size: [0.9, 0.7, 0.7], y: 1, color: "#2b2b2b", solid: false },    // machine
    { at: [1.2, -1.2], size: [0.5, 0.35, 0.5], y: 1, color: "#d9d2c3", solid: false },  // cups
  ],
  pois: [{ id: "order", at: [-0.5, 0.2], face: Math.PI, clip: "sip-coffee", slots: 3, label: "Coffee" }],
};
export default z;
