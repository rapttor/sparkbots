import type { Vector3 } from "three";
import type { Worker as BotWorker } from "../../server/adapters/types";
import { useStore } from "../state/store";
import type { DeskSlot, Layout } from "./layout";
import { roams } from "./roam";

/** Talk to a worker right in the room (speech bubble), instead of leaving for the Teams tab. */
export function selectWorker(id: string): void {
  useStore.getState().openChat(id);
}

export const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/** The robot closest to the manager (where it stands right now, not its desk), within reach. */
export function nearestBot(l: Layout, p: Vector3): { worker: BotWorker; index: number } | null {
  let best: { worker: BotWorker; index: number } | null = null, bd = 4 * 4;
  l.desks.forEach((d, index) => {
    const r = roams.get(d.worker.id);
    const dx = (r?.x ?? d.x) - p.x, dz = (r?.z ?? d.z) - p.z, dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; best = { worker: d.worker, index }; }
  });
  return best;
}

export function nearestDesk(l: Layout, p: Vector3): DeskSlot | null {
  let best: DeskSlot | null = null;
  let bd = 2 * 2;
  for (const d of l.desks) {
    const dx = d.x - p.x, dz = d.z - p.z;
    const q = dx * dx + dz * dz;
    if (q < bd) { bd = q; best = d; }
  }
  return best;
}
