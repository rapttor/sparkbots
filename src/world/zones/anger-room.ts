import type { Zone } from "../zones";
/**
 * Anger room: a padded room with a weapon rack. Walking in (or clicking the rack) opens the weapon pick; for 60 seconds
 * breakable office junk appears to smash for points. The breakable targets are drawn by `world/rooms/` (not furniture).
 */
const z: Zone = {
  id: "anger-room", name: "Anger room", place: "south", size: [9, 6], floor: "#3b1f24", icon: "💢", weight: 0.4,
  props: [
    { at: [0, -2.9], size: [8.8, 2.4, 0.2], color: "#7f1d1d", ghost: true },       // padded back wall
    { at: [-4.4, 0], size: [0.2, 2.4, 5.8], color: "#7f1d1d", ghost: true },
    { at: [4.4, 0], size: [0.2, 2.4, 5.8], color: "#7f1d1d", ghost: true },
    { at: [-3.7, 2.3], size: [1.4, 0.9, 0.5], color: "#5c4b3b" },                  // weapon rack
    { at: [-3.7, 2.3], size: [1.2, 0.15, 0.1], y: 1.0, color: "#b91c1c", solid: false },
  ],
  pois: [{ id: "rack", at: [-3.7, 1.4], face: Math.PI, clip: "shrug", slots: 2, label: "Weapon rack" }],
};
export default z;
