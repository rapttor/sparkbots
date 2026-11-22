import type { Zone } from "../zones";
import { FIELD, RACKS, RACK_SIZE } from "../datacenterSlots";
/** Data center / data room: a grid of server racks (one per project) inside a force field, plus a console desk. Not an idle spot. */
const z: Zone = {
  id: "data-room", name: "Data room", place: "north", size: [10, 8], floor: "#161c28", idle: false,
  props: [
    // one solid rack per project slot (world/datacenter.tsx adds LEDs, tapes, cables and labels on top)
    ...RACKS.map((r) => ({ at: [r.x, r.z] as [number, number], size: RACK_SIZE, color: "#1b1f2a" })),
    // force field around the rack block: see-through, never blocks anyone
    { at: [FIELD.x, FIELD.z - FIELD.d / 2], size: [FIELD.w, FIELD.h, 0.04], color: "#33c3f0", ghost: true },
    { at: [FIELD.x, FIELD.z + FIELD.d / 2], size: [FIELD.w, FIELD.h, 0.04], color: "#33c3f0", ghost: true },
    { at: [FIELD.x - FIELD.w / 2, FIELD.z], size: [0.04, FIELD.h, FIELD.d], color: "#33c3f0", ghost: true },
    { at: [FIELD.x + FIELD.w / 2, FIELD.z], size: [0.04, FIELD.h, FIELD.d], color: "#33c3f0", ghost: true },
    // console desk at (2.5, -1.8)
    { at: [3.2, -1.8], size: [2.4, 0.1, 1.0], y: 0.7, color: "#4b5563" },
    { at: [2.2, -1.8], size: [0.2, 0.7, 0.9], color: "#374151", solid: false },
    { at: [4.2, -1.8], size: [0.2, 0.7, 0.9], color: "#374151", solid: false },
    { at: [3.2, -2.3], size: [1.2, 0.7, 0.06], y: 0.8, color: "#0b0f14", solid: false },
    { at: [3.2, -2.26], size: [1.1, 0.55, 0.02], y: 0.88, color: "#33c3f0", solid: false },
  ],
  pois: [
    { id: "console", at: [3.2, -0.7], face: 0, clip: "check-phone", slots: 1, label: "Console" },
  ],
};
export default z;
