import type { Zone } from "../zones";
/** Yard: grass lawn with a low fence on three sides, three trees, a bench and two robot dogs. */
const dog = (x: number, z: number) => [
  { at: [x, z] as [number, number], size: [0.7, 0.3, 0.3] as [number, number, number], y: 0.3, color: "#d9a46b", solid: false }, // body
  { at: [x + 0.5, z] as [number, number], size: [0.25, 0.25, 0.25] as [number, number, number], y: 0.3, color: "#c8925a", solid: false }, // head
  { at: [x - 0.25, z - 0.1] as [number, number], size: [0.08, 0.3, 0.08] as [number, number, number], color: "#8a5a34", solid: false },
  { at: [x - 0.25, z + 0.1] as [number, number], size: [0.08, 0.3, 0.08] as [number, number, number], color: "#8a5a34", solid: false },
  { at: [x + 0.25, z - 0.1] as [number, number], size: [0.08, 0.3, 0.08] as [number, number, number], color: "#8a5a34", solid: false },
  { at: [x + 0.25, z + 0.1] as [number, number], size: [0.08, 0.3, 0.08] as [number, number, number], color: "#8a5a34", solid: false },
];

const tree = (x: number, z: number) => [
  { at: [x, z] as [number, number], size: [0.4, 1.6, 0.4] as [number, number, number], color: "#6b4a2b" },            // trunk
  { at: [x, z] as [number, number], size: [1.8, 1.4, 1.8] as [number, number, number], y: 1.6, color: "#3f8f4a", solid: false }, // leaves
];

const z: Zone = {
  id: "yard", name: "Yard", place: "east", size: [10, 10], floor: "#7fb069", outdoor: true,
  props: [
    // low fence on the back, left and right sides; the front (towards the viewer) is open
    { at: [0, -4.75], size: [9.4, 0.8, 0.12], color: "#c9a56a", ghost: true },
    { at: [-4.75, 0], size: [0.12, 0.8, 9.4], color: "#c9a56a", ghost: true },
    { at: [4.75, 0], size: [0.12, 0.8, 9.4], color: "#c9a56a", ghost: true },
    ...tree(-3.2, -2.8),
    ...tree(3.2, -3.0),
    ...tree(3.3, 1.8),
    // bench, with its backrest on the far side
    { at: [0, -2.0], size: [2.4, 0.5, 0.6], color: "#b5773f" },
    { at: [0, -2.38], size: [2.4, 0.6, 0.12], y: 0.5, color: "#a0653a" },
    ...dog(-0.6, 0.8),
    ...dog(1.4, 0.2),
  ],
  pois: [
    { id: "bench", at: [0, -1.2], face: Math.PI, clip: "watch-dogs", slots: 2, label: "Yard bench" },
    { id: "grass", at: [-3.5, 3.0], face: 0, clip: "look-around", slots: 3, label: "Grass edge" },
  ],
};
export default z;
