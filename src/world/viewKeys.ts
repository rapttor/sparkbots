/** Keys that move the camera while you hold them, in every controller (avatar, hand): [ ] turn the view, - = zoom out / in; Shift = faster. Pure. */
const NORM: Record<string, string> = { "{": "[", "}": "]", _: "-", "+": "=" }; // Shift changes the character: treat Shift+[ like [
export const normKey = (k: string): string => NORM[k] ?? k;
export const VIEW_KEYS = ["[", "]", "-", "="] as const;
export const isViewKey = (k: string): boolean => (VIEW_KEYS as readonly string[]).includes(normKey(k));

export const TURN_RATE = 1.6, ZOOM_RATE = 0.55; // rad/s and zoom-range/s at normal speed
/** What the held keys ask for: turn +1 = right, zoom +1 = further away. */
export function viewKeyInput(held: ReadonlySet<string>): { turn: number; zoom: number; fast: number } {
  const turn = (held.has("]") ? 1 : 0) - (held.has("[") ? 1 : 0);
  const zoom = (held.has("-") ? 1 : 0) - (held.has("=") ? 1 : 0);
  return { turn, zoom, fast: held.has("shift") ? 2 : 1 };
}
