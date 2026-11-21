// Camera flight math, kept pure so it can be unit-tested (13.1.13). No three.js here:
// World.tsx owns the vectors, this module owns the timing and easing so a camera move
// is always monotonic, never overshoots, and never exceeds the peak speed cap.

export const FLY_MIN = 0.22; // seconds: shortest flight (short hops stay snappy)
export const FLY_SPEED = 90; // world units / second: the peak speed cap the animation must respect
export const PEAK_FACTOR = 1.5; // smoothstep's steepest slope is 1.5x its average, so the cap is on the peak

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Ease-in-out (smoothstep): 0 at 0, 1 at 1, no overshoot in between. */
export function smooth(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** Distance-based flight duration: short hops stay snappy, long hops are not slow, peak speed bounded by FLY_SPEED. */
export function flyDuration(distance: number, speed = FLY_SPEED): number {
  const d = Math.max(0, distance);
  return Math.max(FLY_MIN, (PEAK_FACTOR * d) / speed);
}

/** Advance a flight clock by `dt`. Monotonic and clamped to 0..1, so it can never overshoot. */
export function advance(t: number, duration: number, dt: number): number {
  const d = duration > 0 ? duration : FLY_MIN;
  return clamp01(t + dt / d);
}

/** Peak speed of a flight (at the middle of the ease). Never exceeds FLY_SPEED. */
export function flyPeak(distance: number, duration = flyDuration(distance)): number {
  return duration > 0 ? (PEAK_FACTOR * Math.max(0, distance)) / duration : Number.POSITIVE_INFINITY;
}

/** User preferences for camera moves (Settings > 3D office). Fast = 2x cap; reduced = short fades. */
export interface FlyPrefs { speed: "fast" | "normal"; reduced: boolean }
export const FLY_PREFS_DEFAULT: FlyPrefs = { speed: "normal", reduced: false };
export const REDUCED_MAX = 0.3; // seconds: the longest a flight may last with reduced motion on

/** Flight duration with the user's preferences applied. */
export function flyDurationFor(distance: number, prefs: FlyPrefs = FLY_PREFS_DEFAULT): number {
  const base = flyDuration(distance, prefs.speed === "fast" ? FLY_SPEED * 2 : FLY_SPEED);
  return prefs.reduced ? Math.min(base, REDUCED_MAX) : base;
}

/** How many world units one screen pixel covers at a camera distance — used by hand mode so the
 *  hand glides faster when zoomed out and slower when zoomed in. */
export function worldPerPixel(distance: number, fovDeg: number, viewportHeight: number): number {
  return (2 * Math.max(0, distance) * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewportHeight);
}
