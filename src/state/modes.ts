import { useEffect, useState } from "react";
import { sendView } from "../world/viewBus";

/**
 * Special (cosmetic) modes that take over the office for a while: a game, a race, smashing in the anger room... Each feature registers
 * itself here; the header shows ONE big red Stop button while any of them is active, and Stop ends them all and returns to normal
 * (the camera flies back behind the character or hand). None of these modes ever touches real agent work.
 */
export interface SpecialMode { id: string; label: string; active: () => boolean; stop: () => void }
const modes = new Map<string, SpecialMode>();
export const registerMode = (m: SpecialMode): (() => void) => { modes.set(m.id, m); return () => { if (modes.get(m.id) === m) modes.delete(m.id); }; };
export const activeModes = (): SpecialMode[] => [...modes.values()].filter((m) => { try { return m.active(); } catch { return false; } });

/** End every active special mode, then fly the camera back to the normal view. */
export function stopAllModes(): void {
  for (const m of activeModes()) { try { m.stop(); } catch { /* one stuck mode must not block the others */ } }
  sendView({ t: "reset" });
}

/** The labels of the active modes, re-checked a couple of times a second (modes change from many places, so polling is the simple robust way). */
export function useActiveModes(): string[] {
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    const tick = () => setLabels((prev) => { const next = activeModes().map((m) => m.label); return next.join("|") === prev.join("|") ? prev : next; });
    tick();
    const h = setInterval(tick, 400);
    return () => clearInterval(h);
  }, []);
  return labels;
}
