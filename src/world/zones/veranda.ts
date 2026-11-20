import type { Zone } from "../zones";
/** Veranda: wooden deck with a barbecue grill, a long picnic table with benches, and a string of lamps. */
const z: Zone = {
  id: "veranda", name: "Veranda", place: "east", size: [8, 10], floor: "#a77a4a", outdoor: true, weight: 1.5,
  props: [
    { at: [-2.5, -3.0], size: [1.2, 0.9, 0.8], color: "#2b2b2b" },                 // grill body
    { at: [-2.5, -3.0], size: [1.3, 0.12, 0.9], y: 0.9, color: "#3d3d3d", solid: false }, // grill lid
    { at: [-2.9, -3.2], size: [0.25, 0.6, 0.25], y: 1.02, color: "#555555", solid: false }, // chimney
    { at: [0.5, 0.5], size: [3.0, 0.1, 1.4], y: 0.75, color: "#c9965c", solid: false },    // table top
    { at: [-0.7, 0], size: [0.12, 0.75, 0.12], color: "#6b4a2b" },               // table legs
    { at: [1.7, 0], size: [0.12, 0.75, 0.12], color: "#6b4a2b" },
    { at: [-0.7, 1.0], size: [0.12, 0.75, 0.12], color: "#6b4a2b" },
    { at: [1.7, 1.0], size: [0.12, 0.75, 0.12], color: "#6b4a2b" },
    { at: [0.5, -0.3], size: [2.8, 0.45, 0.4], color: "#8b5e3c" },              // benches
    { at: [0.5, 1.3], size: [2.8, 0.45, 0.4], color: "#8b5e3c" },
    { at: [-3.8, -4.6], size: [0.1, 2.8, 0.1], color: "#6b4a2b" },              // lamp string posts
    { at: [3.8, -4.6], size: [0.1, 2.8, 0.1], color: "#6b4a2b" },
    { at: [0, -4.6], size: [7.6, 0.03, 0.03], y: 2.6, color: "#3a3a3a", solid: false }, // wire
    { at: [-2.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false }, // lamps
    { at: [-1.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false },
    { at: [-0.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false },
    { at: [0.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false },
    { at: [1.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false },
    { at: [2.5, -4.6], size: [0.2, 0.2, 0.2], y: 2.45, color: "#ffd54a", solid: false },
  ],
  pois: [
    { id: "grill", at: [-2.5, -2.0], face: 0, clip: "grill-bbq", slots: 2, label: "Grill" },
    { id: "picnic", at: [0.5, 2.1], face: 0, clip: "sip-coffee", slots: 4, label: "Picnic table" },
  ],
};
export default z;
