import type { Zone } from "../zones";

const wood = "#5b3a24", steel = "#8d98a8", dark = "#2b2f36", brass = "#b8860b", bean = "#8b6b3d";

/**
 * The coffee station is a small coffee factory: a bean silo and grinder, a brass boiler with a chimney, a counter with the
 * espresso machine where the barista works, and a conveyor belt that carries cups to a packing area. The moving parts
 * (belt, cups, gears, steam, lights) are drawn by `world/coffeefactory.tsx`; this file is the fixed furniture.
 */
const z: Zone = {
  id: "coffee-station", name: "Coffee factory", place: "center", size: [9, 6], floor: "#2a2118",
  props: [
    // counter along the back wall with the espresso machine, cups and a till
    { at: [0, -2.3], size: [6.4, 1.0, 1.0], color: wood },
    { at: [-1.5, -2.3], size: [1.3, 0.9, 0.8], y: 1.0, color: dark, solid: false },
    { at: [-1.5, -1.8], size: [0.9, 0.2, 0.1], y: 1.5, color: "#e5e7eb", solid: false },
    { at: [1.0, -2.3], size: [0.5, 0.35, 0.5], y: 1.0, color: "#d9d2c3", solid: false },
    { at: [1.6, -2.3], size: [0.5, 0.35, 0.5], y: 1.0, color: "#d9d2c3", solid: false },
    { at: [2.3, -2.3], size: [0.7, 0.5, 0.6], y: 1.0, color: steel, solid: false },
    // bean silo with a hopper, and the grinder under it
    { at: [-3.7, -2.2], size: [0.9, 2.2, 0.9], color: bean },
    { at: [-3.7, -2.2], size: [1.3, 0.5, 1.3], y: 2.2, color: "#a07f4b" },
    { at: [-3.7, -0.9], size: [1.0, 1.0, 1.0], color: dark },
    { at: [-3.7, -0.9], size: [0.5, 0.2, 0.5], y: 1.0, color: steel, solid: false },
    // brass boiler with pipes, a chimney and three status lights
    { at: [3.7, -2.1], size: [1.2, 1.8, 1.2], color: brass },
    { at: [2.75, -2.1], size: [0.9, 0.12, 0.12], y: 1.2, color: steel, solid: false },
    { at: [4.2, -2.6], size: [0.3, 3.0, 0.3], color: "#6b7280" },
    { at: [3.35, -1.48], size: [0.14, 0.14, 0.05], y: 1.2, color: "#22c55e", solid: false },
    { at: [3.7, -1.48], size: [0.14, 0.14, 0.05], y: 1.2, color: "#f59e0b", solid: false },
    { at: [4.05, -1.48], size: [0.14, 0.14, 0.05], y: 1.2, color: "#ef4444", solid: false },
    // conveyor belt (rails and base); the moving surface and cups are animated
    { at: [0, 1.3], size: [6.4, 0.5, 0.9], color: dark },
    { at: [0, 0.8], size: [6.4, 0.75, 0.1], color: steel },
    { at: [0, 1.8], size: [6.4, 0.75, 0.1], color: steel },
    // cup dispenser at the start of the belt, crates at the end
    { at: [-3.5, 1.3], size: [0.6, 1.7, 0.6], color: "#d1d5db" },
    { at: [3.6, 1.1], size: [0.9, 0.7, 0.9], color: "#c19a6b" },
    { at: [3.6, 1.1], size: [0.9, 0.7, 0.9], y: 0.7, color: "#d2aa7c" },
    { at: [3.6, 2.3], size: [0.9, 0.7, 0.9], color: "#c19a6b" },
  ],
  pois: [
    { id: "order", at: [0, -0.9], face: Math.PI, clip: "sip-coffee", slots: 3, label: "Coffee" },
    { id: "line", at: [0, 2.5], face: 0, clip: "look-around", slots: 3, label: "Watching the belt" },
  ],
};
export default z;
