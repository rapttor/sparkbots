import type { Zone } from "../zones";
/** Water cooler: a small standing group; the brainstorm spot (Phase 9.7). */
const z: Zone = {
  id: "water-cooler", name: "Water cooler", place: "center", size: [5, 5], floor: "#1b2a3a",
  props: [
    { at: [0, -1.4], size: [0.8, 1.3, 0.8], color: "#cfd8e3" },                 // cooler body
    { at: [0, -1.4], size: [0.6, 0.5, 0.6], y: 1.3, color: "#6ec1ff", solid: false }, // water bottle
    { at: [-1.6, 1.4], size: [1, 0.5, 1], color: "#8b5e3c" },                    // stools
    { at: [1.6, 1.4], size: [1, 0.5, 1], color: "#8b5e3c" },
  ],
  pois: [{ id: "chat", at: [0, 0.4], face: Math.PI, clip: "sip-coffee", slots: 4, label: "Water cooler" }],
};
export default z;
