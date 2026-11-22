/** Idle sponsor bubbles: strictly frequency-capped and OFF by default. Pure decision function. */
export const SPONSOR_BUBBLE_FLAG = "ao.fx.sponsorBubbles";
export const MIN_GAP_MS = 20 * 60_000;     // at most one every 20 minutes
export const MAX_PER_SESSION = 3;
export interface SponsorBubbleState { lastAt: number; shown: number }
export function mayShow(s: SponsorBubbleState, now: number, enabled: boolean, hasLinks: boolean): boolean {
  return enabled && hasLinks && s.shown < MAX_PER_SESSION && (s.shown === 0 || now - s.lastAt >= MIN_GAP_MS);
}
