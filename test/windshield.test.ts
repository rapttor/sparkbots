import { describe, expect, it } from "vitest";
import { SPLAT_LIFE_MS, useWindshield } from "../src/world/games/race/glassSplats";

describe("windshield splashes", () => {
  it("a hit adds a few splats, at most 14 stay on the glass, and old ones are dropped", () => {
    const s = useWindshield.getState();
    s.clear();
    s.hit(3);
    expect(useWindshield.getState().splats).toHaveLength(3);
    for (let i = 0; i < 10; i++) useWindshield.getState().hit(3);
    expect(useWindshield.getState().splats.length).toBeLessThanOrEqual(14);
    for (const p of useWindshield.getState().splats) { expect(p.x).toBeGreaterThanOrEqual(8); expect(p.x).toBeLessThanOrEqual(92); expect(p.size).toBeGreaterThan(50); }
    const stale = useWindshield.getState().splats.map((p) => ({ ...p, at: Date.now() - SPLAT_LIFE_MS - 1 }));
    useWindshield.setState({ splats: stale });
    useWindshield.getState().hit(2);
    expect(useWindshield.getState().splats).toHaveLength(2); // the faded ones are gone
    s.clear();
  });
});
