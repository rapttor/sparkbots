import { describe, expect, it } from "vitest";
import { INTRO_HOLD_S, INTRO_S, introZoom, wantIntro } from "../src/world/intro";

describe("opening shot", () => {
  it("holds on the top view, then sinks smoothly to the owner and stops there", () => {
    expect(introZoom(0, 0.32)).toBe(1);
    expect(introZoom(INTRO_HOLD_S * 0.9, 0.32)).toBe(1);               // the short hold
    let prev = 1;
    for (let t = INTRO_HOLD_S; t <= INTRO_S; t += 0.1) { const z = introZoom(t, 0.32); expect(z).toBeLessThanOrEqual(prev + 1e-9); prev = z; } // only ever zooms in
    expect(introZoom(INTRO_S, 0.32)).toBeCloseTo(0.32, 6);
    expect(introZoom(INTRO_S + 5, 0.32)).toBeCloseTo(0.32, 6);
    const mid = introZoom((INTRO_S + INTRO_HOLD_S) / 2, 0.32);
    expect(mid).toBeGreaterThan(0.6); expect(mid).toBeLessThan(0.72);   // halfway through the time it is about halfway down
  });
  it("is played unless switched off, reduced motion is on, or the page shows demo data", () => {
    const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });
    expect(wantIntro("", store({}))).toBe(true);
    expect(wantIntro("?t=abc", store({}))).toBe(true);
    expect(wantIntro("", store({ "ao.noIntro": "1" }))).toBe(false);
    expect(wantIntro("", store({ "ao.reducedMotion": "1" }))).toBe(false);
    expect(wantIntro("?fixture=40", store({}))).toBe(false);
    expect(wantIntro("?nointro", store({}))).toBe(false);
    expect(wantIntro("?fixture=40&intro", store({}))).toBe(true);
  });
});
