import type { Zone } from "../zones";
/** Sponsor room: one pedestal per sponsor link (see `shared/sponsor.ts`). The cards on them are drawn by `world/rooms/`. */
const z: Zone = {
  id: "sponsor-room", name: "Sponsor room", place: "south", size: [8, 6], floor: "#2a2433", icon: "💛", weight: 0.3,
  props: [
    { at: [-3, -1.0], size: [1.2, 0.8, 1.0], color: "#6d28d9" },
    { at: [-1, -1.0], size: [1.2, 0.8, 1.0], color: "#6d28d9" },
    { at: [1, -1.0], size: [1.2, 0.8, 1.0], color: "#6d28d9" },
    { at: [3, -1.0], size: [1.2, 0.8, 1.0], color: "#6d28d9" },
    { at: [0, -2.8], size: [7.6, 2.4, 0.15], color: "#a78bfa", ghost: true },
  ],
  pois: [{ id: "visit", at: [0, 1.0], face: Math.PI, clip: "look-around", slots: 3, label: "Sponsor pedestals" }],
};
export default z;
