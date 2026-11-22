import { describe, expect, it } from "vitest";
import { activeModes, stopAllModes } from "../src/state/modes";
import { raceHub } from "../src/world/games/race/RaceLayer";
import { mulberry32 } from "../src/world/games/types";
import { buildTrack } from "../src/world/games/race/track";

describe("the race is a special mode (the header's red Stop button)", () => {
  it("is active while a race runs, and stopAllModes ends it", () => {
    raceHub.setEnv({ rng: mulberry32(1), idle: () => ["a", "b"], alive: () => true, name: (a) => a, color: () => "#fff" });
    raceHub.setTrack(buildTrack({ zones: [{ x0: -40, z0: -30, x1: 40, z1: 30 }], areas: [], bounds: { x0: -90, z0: -90, x1: 90, z1: 90 } }));
    expect(activeModes().map((m) => m.id)).not.toContain("race");
    expect(raceHub.start(false)).toBe(true);
    expect(activeModes().map((m) => m.id)).toContain("race");
    stopAllModes();
    expect(raceHub.running).toBe(false);
    expect(activeModes().map((m) => m.id)).not.toContain("race");
  });
});
