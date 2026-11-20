import type { Zone } from "../zones";
/** Cafe: a long counter with an espresso machine, three tables with stools, and a potted plant. */
const z: Zone = {
  id: "cafe", name: "Cafe", place: "center", size: [9, 6], floor: "#e3d3b8",
  props: [
    { at: [0, -2.2], size: [7, 1.0, 0.9], color: "#7a4e2d" },                      // counter
    { at: [-1.5, -2.2], size: [0.9, 0.6, 0.6], y: 1.0, color: "#3a3a3a", solid: false }, // espresso machine
    // table 1 (left)
    { at: [-2.8, 0], size: [1.0, 0.7, 1.0], color: "#8b5e3c" },
    { at: [-2.8, 0], size: [1.1, 0.08, 1.1], y: 0.7, color: "#c9965c", solid: false },
    { at: [-3.5, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    { at: [-2.1, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    // table 2 (middle)
    { at: [0, 0], size: [1.0, 0.7, 1.0], color: "#8b5e3c" },
    { at: [0, 0], size: [1.1, 0.08, 1.1], y: 0.7, color: "#c9965c", solid: false },
    { at: [-0.7, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    { at: [0.7, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    // table 3 (right)
    { at: [2.8, 0], size: [1.0, 0.7, 1.0], color: "#8b5e3c" },
    { at: [2.8, 0], size: [1.1, 0.08, 1.1], y: 0.7, color: "#c9965c", solid: false },
    { at: [2.1, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    { at: [3.5, 0], size: [0.4, 0.5, 0.4], color: "#5b3a24" },
    // plant in the corner
    { at: [3.8, 2.2], size: [0.6, 0.4, 0.6], color: "#b5583a" },
    { at: [3.8, 2.2], size: [0.9, 0.8, 0.9], y: 0.4, color: "#3f8f4a", solid: false },
  ],
  pois: [
    { id: "table-a", at: [-2.8, 1.0], face: 0, clip: "read-book", slots: 2, label: "Cafe table" },
    { id: "table-b", at: [0, 1.0], face: 0, clip: "sip-coffee", slots: 2, label: "Cafe table" },
    { id: "table-c", at: [2.8, 1.0], face: 0, clip: "sip-coffee", slots: 2, label: "Cafe table" },
  ],
};
export default z;
