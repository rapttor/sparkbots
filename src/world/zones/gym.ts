import type { Zone } from "../zones";
/** Gym: a treadmill, a bench press with a barbell, a dumbbell rack, a mat and a small pool. */
const z: Zone = {
  id: "gym", name: "Gym", place: "south", size: [12, 9], floor: "#2a2d33",
  props: [
    // treadmill at (-4, -2.5)
    { at: [-4, -2.5], size: [1.2, 0.2, 2.2], y: 0.25, color: "#2c2f36" },            // belt
    { at: [-4, -3.85], size: [1.0, 1.1, 0.3], y: 0.35, color: "#1a1a1a" },           // console
    { at: [-4, -3.68], size: [0.7, 0.35, 0.04], y: 0.9, color: "#2ec4b6", solid: false }, // screen
    // weight bench with barbell at (1.5, -2.5)
    { at: [1.5, -2.5], size: [1.8, 0.4, 0.6], y: 0.45, color: "#3d5a80" },           // bench
    { at: [1.5, -2.5], size: [2.6, 0.08, 0.08], y: 1.06, color: "#bfc5cc", solid: false }, // bar
    { at: [0.25, -2.5], size: [0.15, 0.5, 0.5], y: 0.85, color: "#222", solid: false },   // plates
    { at: [2.75, -2.5], size: [0.15, 0.5, 0.5], y: 0.85, color: "#222", solid: false },
    // dumbbell rack at (4.5, -3.6)
    { at: [4.5, -3.6], size: [2.2, 0.9, 0.5], color: "#5c4b3b" },                    // rack
    { at: [3.8, -3.6], size: [0.3, 0.22, 0.22], y: 0.9, color: "#2b2b2b", solid: false },
    { at: [4.2, -3.6], size: [0.3, 0.22, 0.22], y: 0.9, color: "#777", solid: false },
    { at: [4.8, -3.6], size: [0.3, 0.22, 0.22], y: 0.9, color: "#2b2b2b", solid: false },
    { at: [5.2, -3.6], size: [0.3, 0.22, 0.22], y: 0.9, color: "#777", solid: false },
    // mirror wall along the back (the glint is drawn by world/rooms)
    { at: [0, -4.42], size: [11, 2.2, 0.06], y: 0.2, color: "#a9d6e5", solid: false },
    { at: [0, -4.42], size: [11.2, 0.08, 0.1], y: 0.12, color: "#6b7280", solid: false },
    // exercise mat
    { at: [-4, 2.5], size: [2.4, 0.02, 1.6], color: "#e76f51", solid: false },
    // small pool with ladder
    { at: [3.5, 2.5], size: [4, 0.02, 3], y: 0.02, color: "#1e90ff", solid: false },
    { at: [5.7, 2.25], size: [0.08, 0.6, 0.08], color: "#cfd8dc", solid: false },     // ladder rails
    { at: [5.7, 2.75], size: [0.08, 0.6, 0.08], color: "#cfd8dc", solid: false },
    { at: [5.7, 2.5], size: [0.08, 0.05, 0.5], y: 0.3, color: "#cfd8dc", solid: false }, // rung
  ],
  pois: [
    { id: "treadmill", at: [-4, -0.9], face: 0, clip: "run-in-place", slots: 1, label: "Treadmill" },
    { id: "bench", at: [1.5, -1.6], face: 0, clip: "lift-weights", slots: 1, label: "Bench" },
    { id: "mat", at: [-4, 2.5], face: 0, clip: "stretch", slots: 2, label: "Mat" },
    { id: "pool-edge", at: [3.5, 4.2], face: 0, clip: "shrug", slots: 2, label: "Pool edge" },
  ],
  weight: 1,
};
export default z;
