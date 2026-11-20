import { describe, expect, it } from "vitest";
import nudge from "../src/world/actions/nudge";
import hire from "../src/world/actions/hire";
import { ACTIONS } from "../src/world/actions";
import type { Worker } from "../server/adapters/types";

const w = (over: Partial<Worker> = {}): Worker => ({ id: "s1", team: "t", cwd: "/p", title: "Fix the thing", state: "idle", activity: "idle", lastEventAt: 1, liveInTerminal: false, helpers: 0, color: "#d97757", ...over });

describe("real actions are guarded", () => {
  it("every real action in the registry has a confirm text naming the target", () => {
    const real = ACTIONS.filter((a) => a.kind === "real");
    expect(real.length).toBeGreaterThanOrEqual(2);
    for (const a of real) expect(a.confirm!(w({ name: "Ada" })), a.label).toContain("Ada");
  });
  it("nudge refuses terminal sessions and busy agents, and confirms the exact text", () => {
    expect(nudge.can!(w({ liveInTerminal: true }))).toMatch(/terminal/i);
    expect(nudge.can!(w({ state: "working" }))).toMatch(/working/i);
    expect(nudge.can!(w({ id: "fresh" }))).toBeNull();
    expect(nudge.confirm!(w())).toContain("Are you still there?");
  });
  it("hire explains that the original is not changed", () => {
    expect(hire.confirm!(w())).toMatch(/not changed/i);
  });
});
