import type { Zone } from "../zones";
/**
 * Restaurant (the former Veranda): a pass-through kitchen along the back wall where the chef works, an order counter in
 * front of it and four dining tables. The chef, the menu, fire and deliveries live in `world/rooms/` (this file is furniture).
 * The BBQ grill and picnic table moved to the yard.
 */
const table = (x: number, z: number) => [
  { at: [x, z] as [number, number], size: [1.5, 0.08, 1.0] as [number, number, number], y: 0.75, color: "#f1e4cf", solid: false }, // top
  { at: [x, z] as [number, number], size: [0.2, 0.75, 0.2] as [number, number, number], color: "#6b4a2b" },                       // pedestal
  { at: [x - 1.0, z] as [number, number], size: [0.4, 0.45, 0.4] as [number, number, number], color: "#b5583a" },                // chairs
  { at: [x + 1.0, z] as [number, number], size: [0.4, 0.45, 0.4] as [number, number, number], color: "#b5583a" },
];
const z: Zone = {
  id: "restaurant", name: "Restaurant", place: "east", size: [8, 10], floor: "#b08968", outdoor: true, weight: 1.5, icon: "🍽",
  props: [
    { at: [0, -3.0], size: [6.0, 0.95, 0.9], color: "#8b5e3c" },                          // order counter
    { at: [0, -3.0], size: [6.1, 0.06, 1.0], y: 0.95, color: "#eeeae2", solid: false },   // counter top
    { at: [-2.6, -4.35], size: [1.3, 0.95, 0.6], color: "#2b2f36" },                      // stove
    { at: [-2.6, -4.35], size: [1.3, 0.6, 0.6], y: 1.9, color: "#8d98a8", solid: false }, // hood
    { at: [3.0, -4.3], size: [1.2, 2.0, 0.8], color: "#eef2f5" },                         // fridge
    { at: [0.2, -4.7], size: [4.0, 0.5, 0.3], y: 1.5, color: "#a06f43", solid: false },   // shelf
    ...table(-1.7, 0.8), ...table(1.7, 0.8), ...table(-1.7, 3.4), ...table(1.7, 3.4),
    { at: [-3.8, 4.6], size: [0.1, 2.8, 0.1], color: "#6b4a2b" },                         // lamp string
    { at: [3.8, 4.6], size: [0.1, 2.8, 0.1], color: "#6b4a2b" },
    { at: [0, 4.6], size: [7.6, 0.03, 0.03], y: 2.6, color: "#3a3a3a", solid: false },
    ...[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((x) => ({ at: [x, 4.6] as [number, number], size: [0.2, 0.2, 0.2] as [number, number, number], y: 2.45, color: "#ffd54a", solid: false })),
  ],
  pois: [
    { id: "order", at: [0, -1.9], face: 0, clip: "check-phone", slots: 2, label: "Order counter" },
    { id: "table-a", at: [-1.7, 1.9], face: 0, clip: "sip-coffee", slots: 2, label: "Table" },
    { id: "table-b", at: [1.7, 1.9], face: 0, clip: "sip-coffee", slots: 2, label: "Table" },
    { id: "table-c", at: [0, 2.2], face: 0, clip: "sip-coffee", slots: 1, label: "Table" },
  ],
};
export default z;
