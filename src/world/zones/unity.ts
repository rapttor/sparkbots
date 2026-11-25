import type { Zone } from "../zones";
/** Unity: the door to the optional public lobby. The pod itself is drawn by `unity/UnityPod.tsx`; the plinth below makes robots walk around it. */
const z: Zone = {
  id: "unity", name: "Unity", place: "center", size: [5, 5], floor: "#0f2a1f", outdoor: true, icon: "🌀", idle: false, weight: 0.1,
  props: [{ at: [0, 0], size: [2.2, 0.2, 2.2], color: "#0b1f17" }],
  pois: [{ id: "door", at: [0, 1.9], face: Math.PI, slots: 1, label: "Unity" }],
};
export default z;
