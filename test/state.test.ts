import { describe, it, expect } from "vitest";
import { applyEvent, initialRuntime, tick, type Thresholds } from "../server/model/state";

const T: Thresholds = { idleMs: 15_000, asleepMs: 600_000, doneMs: 5_000, errorMs: 120_000 };
const act = () => "coding" as const;

describe("worker state machine", () => {
  it("asleep -> idle when process alive", () => {
    const rt = initialRuntime(0);
    tick(rt, 1000, { alive: true, mtimeMs: 0 }, T);
    expect(rt.state).toBe("idle");
  });
  it("tool -> working, turn_end -> done, then idle after wave", () => {
    const rt = initialRuntime(0);
    applyEvent(rt, { kind: "tool", session: "s", tool: "Edit", at: 100 }, act);
    expect(rt.state).toBe("working"); expect(rt.activity).toBe("coding");
    applyEvent(rt, { kind: "turn_end", session: "s", at: 200 }, act);
    expect(rt.state).toBe("done");
    tick(rt, 200 + T.doneMs, { alive: true, mtimeMs: 200 }, T);
    expect(rt.state).toBe("idle");
  });
  it("a finished headless run (no process) does not stay working", () => {
    const rt = initialRuntime(0);
    applyEvent(rt, { kind: "tool", session: "s", tool: "Write", at: 100 }, act);
    tick(rt, 100 + T.idleMs, { alive: false, mtimeMs: 100 }, T);
    expect(rt.state).toBe("idle");
  });
  it("permission_wait -> waiting", () => {
    const rt = initialRuntime(0);
    applyEvent(rt, { kind: "permission_wait", session: "s", at: 5 }, act);
    expect(rt.state).toBe("waiting");
  });
  it("error returns to idle after errorMs", () => {
    const rt = initialRuntime(0);
    applyEvent(rt, { kind: "error", session: "s", message: "x", at: 10 }, act);
    tick(rt, 10 + T.errorMs, { alive: true, mtimeMs: 0 }, T);
    expect(rt.state).toBe("idle");
  });
  it("no process and quiet > 10min -> asleep", () => {
    const rt = initialRuntime(0, 0); rt.state = "idle";
    tick(rt, T.asleepMs + 1, { alive: false, mtimeMs: 0 }, T);
    expect(rt.state).toBe("asleep");
  });
  it("fresh mtime without hooks -> working (heuristic)", () => {
    const rt = initialRuntime(0);
    tick(rt, 10_000, { alive: false, mtimeMs: 5_000 }, T);
    expect(rt.state).toBe("working");
  });
  it("subagents tracked and cleared on turn_end", () => {
    const rt = initialRuntime(0);
    applyEvent(rt, { kind: "subagent", session: "s", childId: "a", state: "start", at: 1 }, act);
    expect(rt.helpers.size).toBe(1);
    applyEvent(rt, { kind: "turn_end", session: "s", at: 2 }, act);
    expect(rt.helpers.size).toBe(0);
  });
});
