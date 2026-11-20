import type { Zone } from "../zones";
/** Manager room: a kanban wall, a whiteboard, the manager's desk and a meeting table. Not an idle spot. */
const z: Zone = {
  id: "manager-room", name: "Manager room", place: "north", size: [12, 8], floor: "#262a33", idle: false,
  props: [
    // kanban board on the back wall, five coloured columns
    { at: [0, -3.8], size: [6.4, 2.0, 0.15], y: 1.0, color: "#1e2430", solid: false },
    { at: [-2.4, -3.7], size: [1.0, 1.4, 0.05], y: 1.3, color: "#e76f51", solid: false },
    { at: [-1.2, -3.7], size: [1.0, 1.4, 0.05], y: 1.3, color: "#f4a261", solid: false },
    { at: [0, -3.7], size: [1.0, 1.4, 0.05], y: 1.3, color: "#2a9d8f", solid: false },
    { at: [1.2, -3.7], size: [1.0, 1.4, 0.05], y: 1.3, color: "#4d7cfe", solid: false },
    { at: [2.4, -3.7], size: [1.0, 1.4, 0.05], y: 1.3, color: "#a06cd5", solid: false },
    // whiteboard beside it
    { at: [4.6, -3.8], size: [2.4, 1.6, 0.08], y: 0.9, color: "#f5f7fa", solid: false },
    // manager desk with pedestal, monitor and chair
    { at: [-3.5, -1.2], size: [3.0, 0.1, 1.4], y: 0.7, color: "#6b4f3a" },
    { at: [-4.6, -1.2], size: [0.8, 0.7, 1.2], color: "#4e3a2a" },
    { at: [-3.5, -1.6], size: [0.6, 0.4, 0.06], y: 0.8, color: "#111", solid: false },
    { at: [-3.5, -0.1], size: [0.7, 0.1, 0.7], y: 0.45, color: "#2f3b52" },
    { at: [-3.5, 0.3], size: [0.7, 0.6, 0.1], y: 0.55, color: "#2f3b52", solid: false },
    // meeting table with four legs
    { at: [3, 1], size: [3.0, 0.1, 1.6], y: 0.7, color: "#8d6e4f" },
    { at: [1.6, 0.4], size: [0.1, 0.7, 0.1], color: "#5e4632", solid: false },
    { at: [4.4, 0.4], size: [0.1, 0.7, 0.1], color: "#5e4632", solid: false },
    { at: [1.6, 1.6], size: [0.1, 0.7, 0.1], color: "#5e4632", solid: false },
    { at: [4.4, 1.6], size: [0.1, 0.7, 0.1], color: "#5e4632", solid: false },
  ],
  pois: [
    { id: "board", at: [0, -2.6], face: 0, clip: "look-around", slots: 2, label: "Kanban board" },
  ],
};
export default z;
