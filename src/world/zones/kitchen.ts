import type { Zone } from "../zones";
/** Kitchen: counter with sink and stove along the back wall, a fridge, and a central island with stools. */
const z: Zone = {
  id: "kitchen", name: "Kitchen", place: "center", size: [8, 5], floor: "#e6dccb",
  props: [
    { at: [-0.5, -1.9], size: [6, 0.95, 1.1], color: "#b98a5a" },                 // counter
    { at: [-0.5, -1.9], size: [6.1, 0.06, 1.2], y: 0.95, color: "#eeeae2", solid: false }, // counter top
    { at: [-1.8, -1.9], size: [0.9, 0.08, 0.6], y: 0.95, color: "#9aa8b4", solid: false },  // sink
    { at: [1.5, -1.9], size: [1.0, 0.08, 1.0], y: 0.95, color: "#2a2a2a", solid: false },   // stove top
    { at: [3.2, -1.8], size: [1.2, 2.0, 1.0], color: "#eef2f5" },                // fridge
    { at: [-0.5, -2.25], size: [5.5, 0.7, 0.5], y: 1.6, color: "#a06f43", solid: false },   // wall cabinets
    { at: [0, 0.2], size: [3, 0.95, 1.2], color: "#b98a5a" },                    // island
    { at: [0, 0.2], size: [3.1, 0.06, 1.3], y: 0.95, color: "#eeeae2", solid: false },    // island top
    { at: [-0.9, 1.9], size: [0.45, 0.5, 0.45], color: "#7a4e2d" },              // stools
    { at: [0, 1.9], size: [0.45, 0.5, 0.45], color: "#7a4e2d" },
    { at: [0.9, 1.9], size: [0.45, 0.5, 0.45], color: "#7a4e2d" },
    { at: [-3.5, 1.9], size: [0.5, 0.5, 0.5], color: "#b5583a" },               // potted plant
    { at: [-3.5, 1.9], size: [0.8, 0.7, 0.8], y: 0.5, color: "#3f8f4a", solid: false },
  ],
  pois: [
    { id: "island", at: [0, 1.2], face: 0, clip: "sip-coffee", slots: 3, label: "Kitchen island" },
    { id: "stove", at: [2.2, -0.8], face: 0, clip: "cook", slots: 1, label: "Stove" },
  ],
};
export default z;
