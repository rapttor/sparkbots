import { useStore } from "../state/store";
import { sendView } from "./viewBus";
import { playBeam } from "./teleport";
import { player, poiById, roams } from "./roam";

/** The spot you stand at to chat: just south of the cooler, looking at it and the agent. */
export const COOLER_ID = "water-cooler:chat";

/**
 * Water cooler chat with an agent that is somewhere else: beam the agent to the cooler and take you there too (walking when close, beaming
 * when far: the camera's own rule). Without a water cooler in the layout you go to the agent instead. Cosmetic: no session is touched.
 * Returns where the chat takes place.
 */
export function gatherAtCooler(agent: string): { x: number; z: number } {
  const r = roams.get(agent), poi = poiById(COOLER_ID);
  const at = poi ? { x: poi.x, z: poi.z } : r ? { x: r.x, z: r.z } : { x: player.x, z: player.z };
  if (r && poi) {
    playBeam(r.x, r.z, "out");
    r.visit = null; r.clip = null; r.game = null; r.errand = null;
    r.x = r.tx = poi.x; r.z = r.tz = poi.z; r.wait = 3; r.ry = poi.face;
    playBeam(poi.x, poi.z, "in");
  }
  sendView({ t: "mode", mode: "walk" });
  useStore.getState().focusPoint(at.x, at.z + (poi ? 2.4 : 1.8));
  return at;
}
