import type { Zone } from "../zones";
/** Data room: three tall server racks with status LEDs, a console desk and cable trays on the floor. Not an idle spot. */
const z: Zone = {
  id: "data-room", name: "Data room", place: "north", size: [10, 8], floor: "#161c28", idle: false,
  props: [
    // three server racks against the back wall
    { at: [-3, -3], size: [1.0, 2.2, 0.8], color: "#1b1f2a" },
    { at: [-1.6, -3], size: [1.0, 2.2, 0.8], color: "#1b1f2a" },
    { at: [-0.2, -3], size: [1.0, 2.2, 0.8], color: "#1b1f2a" },
    // status LEDs on each rack front
    { at: [-3.25, -2.58], size: [0.3, 0.06, 0.04], y: 1.4, color: "#3ddc84", solid: false },
    { at: [-2.75, -2.58], size: [0.3, 0.06, 0.04], y: 0.8, color: "#ffb020", solid: false },
    { at: [-1.85, -2.58], size: [0.3, 0.06, 0.04], y: 1.4, color: "#3ddc84", solid: false },
    { at: [-1.35, -2.58], size: [0.3, 0.06, 0.04], y: 0.8, color: "#ffb020", solid: false },
    { at: [-0.45, -2.58], size: [0.3, 0.06, 0.04], y: 1.4, color: "#3ddc84", solid: false },
    { at: [0.05, -2.58], size: [0.3, 0.06, 0.04], y: 0.8, color: "#ffb020", solid: false },
    // console desk at (2.5, -1.8)
    { at: [2.5, -1.8], size: [2.4, 0.1, 1.0], y: 0.7, color: "#4b5563" },
    { at: [1.5, -1.8], size: [0.2, 0.7, 0.9], color: "#374151", solid: false },
    { at: [3.5, -1.8], size: [0.2, 0.7, 0.9], color: "#374151", solid: false },
    { at: [2.5, -2.3], size: [1.2, 0.7, 0.06], y: 0.8, color: "#0b0f14", solid: false },
    { at: [2.5, -2.26], size: [1.1, 0.55, 0.02], y: 0.88, color: "#33c3f0", solid: false },
    // cable trays on the floor
    { at: [-1.6, -0.2], size: [0.4, 0.04, 4.6], color: "#64748b", solid: false },
    { at: [0, 1.5], size: [4.0, 0.04, 0.4], color: "#64748b", solid: false },
  ],
  pois: [
    { id: "console", at: [2.5, -0.7], face: 0, clip: "check-phone", slots: 1, label: "Console" },
  ],
};
export default z;
