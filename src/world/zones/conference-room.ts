import type { Zone } from "../zones";
/** Conference room: glass walls on three sides, open front with a door gap, a screen, and a table + chairs that grow with the number of people inside (ConferenceLayer). Not an idle spot. */
const glass = "#9fd8f2";
const z: Zone = {
  id: "conference-room", name: "Conference room", place: "center", size: [9, 7], floor: "#2b2f3a", idle: false,
  props: [
    // glass walls: back, left, right and the two front pieces (gap in the middle)
    { at: [0, -3.4], size: [9.0, 2.2, 0.2], color: glass, ghost: true },
    { at: [-4.4, 0], size: [0.2, 2.2, 6.8], color: glass, ghost: true },
    { at: [4.4, 0], size: [0.2, 2.2, 6.8], color: glass, ghost: true },
    { at: [-3.25, 3.4], size: [2.5, 2.2, 0.2], color: glass, ghost: true },
    { at: [3.25, 3.4], size: [2.5, 2.2, 0.2], color: glass, ghost: true },
    // screen on the back wall
    { at: [0, -3.26], size: [5.0, 1.2, 0.08], y: 0.9, color: "#101820", solid: false },
    // the table and chairs are drawn by ConferenceLayer: they grow with the number of people inside
  ],
  pois: [],
};
export default z;
