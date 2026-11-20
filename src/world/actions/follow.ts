import { useStore } from "../../state/store";
import type { BotAction } from "../actions";

/** Make an agent walk with you (toggle). They trail behind, huddle round you when you stop, and sit down in the conference room. */
const follow: BotAction = {
  key: "f", label: "Follow me", hint: "walk with you; press again to stop", kind: "fx",
  run: (id) => useStore.getState().toggleFollower(id),
};
export default follow;
