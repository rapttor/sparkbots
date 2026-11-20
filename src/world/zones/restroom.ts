import type { Zone } from "../zones";
/** Restroom: three stalls along the back wall, a row of two sinks with a mirror, and a queue spot. */
const z: Zone = {
  id: "restroom", name: "Restroom", place: "center", size: [6, 5], floor: "#cfd9d6", idle: true,
  props: [
    { at: [-1.8, -1.9], size: [0.08, 1.4, 1.2], color: "#e9efee" },              // stall dividers
    { at: [-0.6, -1.9], size: [0.08, 1.4, 1.2], color: "#e9efee" },
    { at: [0.6, -1.9], size: [0.08, 1.4, 1.2], color: "#e9efee" },
    { at: [1.8, -1.9], size: [0.08, 1.4, 1.2], color: "#e9efee" },
    { at: [-1.2, -1.3], size: [1.1, 1.3, 0.06], color: "#8fb8c9" },              // stall doors
    { at: [0, -1.3], size: [1.1, 1.3, 0.06], color: "#8fb8c9" },
    { at: [1.2, -1.3], size: [1.1, 1.3, 0.06], color: "#8fb8c9" },
    { at: [2.1, 0.2], size: [0.8, 0.9, 2.2], color: "#d7d2c8" },                // sink counter
    { at: [2.1, -0.4], size: [0.6, 0.08, 0.5], y: 0.9, color: "#9fb3c2", solid: false }, // sinks
    { at: [2.1, 0.6], size: [0.6, 0.08, 0.5], y: 0.9, color: "#9fb3c2", solid: false },
    { at: [2.9, 0.2], size: [0.1, 1.0, 2.0], y: 1.2, color: "#bfe3f2", solid: false },  // mirror
    { at: [-2.3, 1.8], size: [0.5, 0.7, 0.5], color: "#6b6f75" },              // waste bin
  ],
  pois: [{ id: "queue", at: [-0.8, 0.9], face: 0, clip: "shrug", slots: 2, label: "Restroom queue" }],
};
export default z;
