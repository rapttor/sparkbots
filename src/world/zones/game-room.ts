import type { Zone } from "../zones";
/** Game room: billiards, foosball, darts and ping-pong, with a sofa by the back wall. */
const z: Zone = {
  id: "game-room", name: "Game room", place: "south", size: [14, 9], floor: "#2c2a3d",
  props: [
    // billiard table at (-4, -2)
    { at: [-4, -2], size: [2.9, 0.12, 1.7], y: 0.7, color: "#6b3e1f" },                // brown rim
    { at: [-4, -2], size: [2.5, 0.04, 1.3], y: 0.82, color: "#1f6b3a", solid: false },  // green felt
    { at: [-5.3, -2.7], size: [0.12, 0.7, 0.12], color: "#3e2415", solid: false },      // legs
    { at: [-2.7, -2.7], size: [0.12, 0.7, 0.12], color: "#3e2415", solid: false },
    { at: [-5.3, -1.3], size: [0.12, 0.7, 0.12], color: "#3e2415", solid: false },
    { at: [-2.7, -1.3], size: [0.12, 0.7, 0.12], color: "#3e2415", solid: false },
    // darts on the back wall, oche line on the floor
    { at: [4, -4.2], size: [1.2, 1.2, 0.08], y: 1.2, color: "#c0392b", solid: false },
    { at: [4, -2.4], size: [1.6, 0.02, 0.1], color: "#f2f2f2", solid: false },
    // ping-pong table at (-3, 1.6)
    { at: [-3, 1.6], size: [2.7, 0.7, 1.5], color: "#24314d" },                       // apron
    { at: [-3, 1.6], size: [2.7, 0.06, 1.5], y: 0.7, color: "#1d4fb3", solid: false }, // blue top
    { at: [-3, 1.6], size: [0.04, 0.16, 1.6], y: 0.72, color: "#f5f5f5", solid: false }, // net
    // foosball table at (3, 0.5)
    { at: [3, 0.5], size: [2.6, 0.5, 1.2], y: 0.4, color: "#8a5a2b" },
    { at: [2.1, 0.5], size: [0.05, 0.08, 1.3], y: 0.9, color: "#e53935", solid: false },
    { at: [2.7, 0.5], size: [0.05, 0.08, 1.3], y: 0.9, color: "#fdd835", solid: false },
    { at: [3.3, 0.5], size: [0.05, 0.08, 1.3], y: 0.9, color: "#1e88e5", solid: false },
    { at: [3.9, 0.5], size: [0.05, 0.08, 1.3], y: 0.9, color: "#f5f5f5", solid: false },
    // sofa against the far wall
    { at: [5, 3.4], size: [2.4, 0.4, 1.0], y: 0.1, color: "#7a3e9d" },                // seat
    { at: [5, 3.75], size: [2.4, 0.8, 0.3], y: 0.1, color: "#6a3389" },               // back
    { at: [3.925, 3.4], size: [0.25, 0.5, 1.0], y: 0.1, color: "#5f2f7a" },           // arms
    { at: [6.075, 3.4], size: [0.25, 0.5, 1.0], y: 0.1, color: "#5f2f7a" },
  ],
  pois: [
    { id: "billiard", at: [-4, -0.6], face: 0, clip: "play-pool", slots: 2, label: "Billiards" },
    { id: "foosball", at: [3, -0.8], face: Math.PI, clip: "play-foosball", slots: 2, label: "Foosball" },
    { id: "darts", at: [4, -1.6], face: 0, clip: "juggle", slots: 2, label: "Darts" },
    { id: "ping-pong", at: [-3, 3], face: 0, clip: "dance-idle", slots: 2, label: "Ping-pong" },
  ],
  weight: 1.5,
};
export default z;
