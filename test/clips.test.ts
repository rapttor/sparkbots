import { describe, expect, it } from "vitest";
import { CLIPS, IDLE_CLIPS, clipProblems, statusClip } from "../src/world/clips";

describe("clip registry", () => {
  it("every clip is valid and ids are unique", () => {
    expect(CLIPS.length).toBeGreaterThan(0);
    expect(new Set(CLIPS.map((c) => c.id)).size).toBe(CLIPS.length);
    for (const c of CLIPS) expect(clipProblems(c), c.id).toEqual([]);
  });
  it("has idle clips and the three status clips (done, error, waiting)", () => {
    expect(IDLE_CLIPS.length).toBeGreaterThan(0);
    for (const s of ["done", "error", "waiting"] as const) expect(statusClip(s), s).toBeTruthy();
    expect(statusClip("error")!.orbit).toBeTruthy();
  });
  it("poses stay finite over time", () => {
    for (const c of CLIPS) for (const t of [0, 0.3, 1.7, 10, 1000]) for (const v of Object.values(c.pose(t, 1.4))) expect(Number.isFinite(v)).toBe(true);
  });
});
