import { runProblem } from "../src/world/runStatus";

/** True when the run's stream shows the model service refusing for usage / rate limit reasons (the same detection the chat uses). */
export function isRateLimited(lines: unknown[]): boolean {
  const p = runProblem(lines);
  return !!p && /\b429\b|rate.?limit|usage limit|limit reached|too many requests/i.test(p.text);
}

export const AUTO_MS = 30 * 60_000;   // an automatic detection lasts this long unless a later run succeeds
export const MANUAL_MS = 2 * 3_600_000; // the manual toggle lasts this long unless switched off

/** The `rateLimited{until}` flag: set automatically from run problems or by hand in Settings. */
export class RateLimit {
  private autoUntil = 0;
  private manualUntil = 0;
  until(now = Date.now()): number { const u = Math.max(this.autoUntil, this.manualUntil); return u > now ? u : 0; }
  /** Feed the latest stream lines of a run. Returns true when the flag changed. */
  observe(lines: unknown[], now = Date.now()): boolean {
    const before = this.until(now) > 0;
    if (isRateLimited(lines)) this.autoUntil = now + AUTO_MS;
    else if (lines.some((l) => (l as { type?: unknown } | null)?.type === "result")) this.autoUntil = 0; // a run finished fine
    return this.until(now) > 0 !== before;
  }
  setManual(on: boolean, now = Date.now()) {
    this.manualUntil = on ? now + MANUAL_MS : 0;
    if (!on) this.autoUntil = 0;
  }
}
