/** The opening shot: the camera starts high above the whole campus (the top view) and sinks slowly towards the owner, as if you had scrolled all the way in. Pure easing; the scene drives it. */
export const INTRO_S = 6;       // seconds, including the short hold on the top view
export const INTRO_HOLD_S = 0.8;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Zoom value (1 = top view, 0 = first person) `t` seconds into the intro, ending at `to`. Holds, eases in, eases out. */
export function introZoom(t: number, to: number, dur = INTRO_S, hold = INTRO_HOLD_S): number {
  const k = clamp01((t - hold) / Math.max(0.01, dur - hold));
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
  return 1 + (to - 1) * e;
}

/** Played once per page load, unless switched off in Settings, reduced motion is on, or the page shows demo data (screenshots, tests). */
export function wantIntro(search: string, store: { getItem(k: string): string | null }): boolean {
  try {
    if (store.getItem("ao.noIntro") === "1" || store.getItem("ao.reducedMotion") === "1") return false;
    const q = new URLSearchParams(search);
    if (q.has("intro")) return true; // ?intro forces it (demo data included)
    return !q.has("fixture") && !q.has("nointro");
  } catch { return true; }
}
