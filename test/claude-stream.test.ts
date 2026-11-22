import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { foldLog, partialText, permissionDenials, textDelta } from "../src/shared/claudeStream";
import { buildArgs, RunManager, CommandError } from "../server/adapters/claude-code/command";

beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });
const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });

describe("text deltas", () => {
  it("reads text_delta and ignores everything else", () => {
    expect(textDelta(delta("Hi"))).toBe("Hi");
    expect(textDelta({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } } })).toBeNull();
    expect(textDelta({ type: "stream_event", event: { type: "message_start" } })).toBeNull();
    for (const junk of [null, 5, "x", [], {}, { type: "stream_event" }, { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: 3 } } }]) expect(textDelta(junk)).toBeNull();
  });
  it("grows one partial line and the assistant message replaces it", () => {
    let log: unknown[] = [{ type: "system" }];
    for (const l of [{ type: "stream_event", event: { type: "message_start" } }, delta("Hel"), delta("lo")]) log = foldLog(log, l);
    expect(log).toHaveLength(2);
    expect(partialText(log)).toBe("Hello");
    log = foldLog(log, { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } });
    expect(partialText(log)).toBe("");
    expect(log.map((l) => (l as { type: string }).type)).toEqual(["system", "assistant"]);
  });
});

describe("permission denials", () => {
  it("reads tool names from the result record", () => {
    const log = [{ type: "assistant" }, { type: "result", permission_denials: [{ tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "ls" } }, { tool_name: "Write" }, { bogus: 1 }, null] }];
    expect(permissionDenials(log).map((d) => d.tool)).toEqual(["Bash", "Write"]);
  });
  it("is empty when absent, malformed, or the run moved on", () => {
    expect(permissionDenials([{ type: "result", permission_denials: [] }])).toEqual([]);
    expect(permissionDenials([{ type: "result", permission_denials: "x" }])).toEqual([]);
    expect(permissionDenials([{ type: "result", permission_denials: [{ tool_name: "Bash" }] }, { type: "assistant" }])).toEqual([]);
  });
});

describe("args and retry", () => {
  it("streams partial messages and never bypasses permissions", () => {
    const a = buildArgs("hi", "s", { allowedTools: ["Bash"] });
    expect(a).toContain("--include-partial-messages");
    expect(a).toContain("--allowedTools=Bash");
    expect(a.join(" ")).not.toMatch(/dangerously|bypass/);
  });
  it("rejects unsafe tool names and unknown runs on retry", () => {
    const m = new RunManager(() => false, "/nonexistent-claude");
    expect(() => m.retryWithTools("nope", ["Bash"])).toThrow(CommandError);
    m.runs.push({ runId: "r1", session: "s1", cwd: process.cwd(), prompt: "p", pid: 1, status: "done", startedAt: 1 });
    expect(() => m.retryWithTools("r1", ["--dangerously-skip-permissions"])).toThrow(/invalid tool/);
    expect(() => m.retryWithTools("r1", ["Bash,Write"])).toThrow(/invalid tool/);
  });
});
