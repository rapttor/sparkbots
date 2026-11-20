import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLine, toolActivity, titleFromRecord } from "../server/adapters/claude-code/parse.js";
import type { AgentEvent } from "../server/adapters/types.js";

const lines = readFileSync(new URL("./fixtures/session-a.jsonl", import.meta.url), "utf8")
  .split("\n").filter(Boolean);

describe("parseLine", () => {
  const results = lines.map(parseLine);
  const events: AgentEvent[] = results.flatMap((r) => r.events);

  it("skips exactly one corrupt line", () => {
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("extracts cwd and sessionId", () => {
    expect(results.find((r) => r.cwd)?.cwd).toBe("/fake/proj");
    expect(results.find((r) => r.sessionId)?.sessionId).toBe("sess-aaa");
  });

  it("emits every event kind expected", () => {
    const kinds = new Set(events.map((e) => e.kind));
    for (const k of ["tool", "turn_start", "turn_end", "message", "usage", "subagent"]) {
      expect(kinds.has(k as AgentEvent["kind"])).toBe(true);
    }
  });

  it("maps tool targets and usage", () => {
    expect(events.find((e) => e.kind === "tool" && e.tool === "Read")).toMatchObject({ target: "/fake/proj/auth.ts" });
    expect(events.find((e) => e.kind === "usage")).toMatchObject({ input: 100, output: 20, cacheRead: 50, cacheWrite: 10 });
    expect(events.find((e) => e.kind === "subagent")).toMatchObject({ childId: "tu_4", state: "start" });
  });

  it("emits nothing for tool_result-only user records and ignored types", () => {
    expect(results[3].events).toEqual([]);
    expect(results[0]).toMatchObject({ ok: true, events: [] });
  });

  it("never throws on non-objects", () => {
    expect(parseLine("123").ok).toBe(false);
    expect(parseLine("null").ok).toBe(false);
  });
});

describe("toolActivity", () => {
  it("maps tools", () => {
    expect(toolActivity("Read")).toBe("researching");
    expect(toolActivity("Write")).toBe("coding");
    expect(toolActivity("Bash", { command: "pnpm test" })).toBe("testing");
    expect(toolActivity("Bash", { command: "git push origin main" })).toBe("shipping");
    expect(toolActivity("Bash", { command: "ls" })).toBe("running");
    expect(toolActivity("Task")).toBe("delegating");
    expect(toolActivity("TodoWrite")).toBe("planning");
    expect(toolActivity("Mystery")).toBe("running");
  });
});

describe("titleFromRecord", () => {
  it("handles titles", () => {
    expect(titleFromRecord({ type: "custom-title", customTitle: "My title" })).toBe("My title");
    expect(titleFromRecord({ type: "user", message: { content: "  hello world" } })).toBe("hello world");
    expect(titleFromRecord({ type: "user", message: { content: "<command>x" } })).toBeUndefined();
  });
});
